import { Router } from "express";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { createIpRateLimiter } from "../middleware/rateLimit";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { BRAZIL_POSTAL_CODE_REGEX, normalizePostalCode, shippingQuoteSchema } from "../schemas/shipping.schema";
import { BOX_FILL_FACTOR, getShipmentConfig } from "../lib/shipping/shipment";
import { getShippingQuote } from "../lib/shipping/quoteService";
import { lookupPostalCode } from "../lib/shipping/viaCep";

export const shippingRouter = Router();

// POST /quote dispara chamadas a um serviço externo (Melhor Envio) a cada
// requisição não cacheada — limite por IP para não deixar alguém martelar o
// endpoint e esgotar a cota/gerar custo indireto.
const QUOTE_RATE_LIMIT_WINDOW_MS = 60_000;
const QUOTE_RATE_LIMIT_MAX_REQUESTS = 20;
const quoteRateLimiter = createIpRateLimiter({
  windowMs: QUOTE_RATE_LIMIT_WINDOW_MS,
  max: QUOTE_RATE_LIMIT_MAX_REQUESTS,
});

shippingRouter.post(
  "/quote",
  quoteRateLimiter,
  asyncHandler(async (req, res) => {
    const body = shippingQuoteSchema.parse(req.body);
    const postalCode = normalizePostalCode(body.postalCode);

    if (body.country === "BR" && !BRAZIL_POSTAL_CODE_REGEX.test(postalCode)) {
      throw new HttpError(400, "CEP inválido: informe 8 dígitos");
    }

    const result = await getShippingQuote(body.country, postalCode, body.items);
    res.json(result);
  })
);

shippingRouter.get(
  "/postal-code/:code",
  asyncHandler(async (req, res) => {
    const code = normalizePostalCode(req.params.code);
    if (!BRAZIL_POSTAL_CODE_REGEX.test(code)) {
      throw new HttpError(400, "CEP inválido: informe 8 dígitos");
    }

    const { city, state } = await lookupPostalCode(code);
    res.json({ postalCode: code, city, state });
  })
);

// Admin, somente leitura — nunca expõe o valor de nenhuma variável, só se
// está configurada. `international` resume a tabela (CRUD em
// routes/shippingAdmin.routes.ts).
shippingRouter.get(
  "/status",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const zones = await prisma.shippingZone.findMany({ select: { active: true, countries: true } });
    const activeZones = zones.filter((zone) => zone.active);
    const { box, packagingWeightG } = getShipmentConfig(env);
    res.json({
      domestic: {
        box: { lengthCm: box.lengthCm, widthCm: box.widthCm, heightCm: box.heightCm },
        packagingWeightG,
        maxItemSizeCm: Math.min(box.lengthCm, box.widthCm, box.heightCm),
        boxFillFactor: BOX_FILL_FACTOR,
        melhorEnvioTokenConfigured: Boolean(env.MELHOR_ENVIO_TOKEN),
        originCepConfigured: Boolean(env.SHIPPING_ORIGIN_CEP),
        sandbox: env.MELHOR_ENVIO_SANDBOX,
      },
      international: {
        zones: zones.length,
        activeZones: activeZones.length,
        activeCountries: new Set(activeZones.flatMap((zone) => zone.countries)).size,
      },
    });
  })
);
