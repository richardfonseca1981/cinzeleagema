import { Router } from "express";
import { Prisma, type ShippingRate, type ShippingZone } from "@prisma/client";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { asyncHandler } from "../utils/asyncHandler";
import { clearInternationalQuoteCache } from "../lib/shipping/quoteCache";
import { countryNamePt } from "../lib/shipping/countryCodes";
import { InternationalTableProvider } from "../lib/shipping/internationalProvider";
import { buildInternationalResult } from "../lib/shipping/quoteService";
import { getShipmentConfig } from "../lib/shipping/shipment";
import {
  DAYS_ORDER_MESSAGE,
  createRateSchema,
  createZoneSchema,
  daysAreOrdered,
  simulateSchema,
  updateRateSchema,
  updateZoneSchema,
} from "../schemas/shippingAdmin.schema";

// Admin do frete internacional (tabela cadastrada pelo cliente). Tudo exige
// JWT. Toda criação/edição/remoção descarta as cotações internacionais em
// cache, para o comprador nunca ver um valor da tabela antiga.
export const shippingAdminRouter = Router();

shippingAdminRouter.use(requireAuth);

// Zod com mensagens já em português: devolve a primeira como erro 400 legível
// (o admin mostra `error` direto).
function parse<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  try {
    return schema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) throw new HttpError(400, err.issues[0]?.message ?? "Dados inválidos");
    throw err;
  }
}

function serializeRate(rate: ShippingRate) {
  return {
    id: rate.id,
    zoneId: rate.zoneId,
    serviceName: rate.serviceName,
    maxWeightG: rate.maxWeightG,
    priceBRL: Math.round(Number(rate.priceBRL) * 100) / 100,
    deliveryDaysMin: rate.deliveryDaysMin,
    deliveryDaysMax: rate.deliveryDaysMax,
    active: rate.active,
  };
}

type ZoneWithRates = ShippingZone & { rates: ShippingRate[] };

function serializeZone(zone: ZoneWithRates) {
  const rates = [...zone.rates].sort(
    (a, b) => a.serviceName.localeCompare(b.serviceName) || a.maxWeightG - b.maxWeightG
  );
  return {
    id: zone.id,
    name: zone.name,
    countries: zone.countries,
    active: zone.active,
    position: zone.position,
    rates: rates.map(serializeRate),
  };
}

async function loadZone(id: string): Promise<ZoneWithRates> {
  const zone = await prisma.shippingZone.findUnique({ where: { id }, include: { rates: true } });
  if (!zone) throw new HttpError(404, "Zona não encontrada");
  return zone;
}

// O mesmo país não pode estar em duas zonas ATIVAS.
async function assertNoCountryConflict(countries: string[], excludeZoneId?: string) {
  const others = await prisma.shippingZone.findMany({
    where: { active: true, countries: { hasSome: countries }, ...(excludeZoneId ? { id: { not: excludeZoneId } } : {}) },
    orderBy: { position: "asc" },
  });
  for (const other of others) {
    const code = countries.find((c) => other.countries.includes(c));
    if (code) {
      throw new HttpError(409, `O país ${countryNamePt(code)} (${code}) já está na zona ativa "${other.name}"`);
    }
  }
}

function rateConflictMessage(serviceName: string, maxWeightG: number) {
  return `Já existe uma faixa do serviço "${serviceName}" até ${maxWeightG} g nesta zona`;
}

async function assertNoRateConflict(zoneId: string, serviceName: string, maxWeightG: number, excludeRateId?: string) {
  const existing = await prisma.shippingRate.findFirst({
    where: { zoneId, serviceName, maxWeightG, ...(excludeRateId ? { id: { not: excludeRateId } } : {}) },
  });
  if (existing) throw new HttpError(409, rateConflictMessage(serviceName, maxWeightG));
}

// Corrida entre duas requisições: a unicidade do banco ainda vale.
function translateUniqueViolation(err: unknown, serviceName: string, maxWeightG: number): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new HttpError(409, rateConflictMessage(serviceName, maxWeightG));
  }
  throw err;
}

shippingAdminRouter.get(
  "/zones",
  asyncHandler(async (_req, res) => {
    const zones = await prisma.shippingZone.findMany({
      include: { rates: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    res.json(zones.map(serializeZone));
  })
);

shippingAdminRouter.post(
  "/zones",
  asyncHandler(async (req, res) => {
    const data = parse(createZoneSchema, req.body);
    if (data.active) await assertNoCountryConflict(data.countries);

    const zone = await prisma.shippingZone.create({ data, include: { rates: true } });
    clearInternationalQuoteCache();
    res.status(201).json(serializeZone(zone));
  })
);

shippingAdminRouter.patch(
  "/zones/:id",
  asyncHandler(async (req, res) => {
    const data = parse(updateZoneSchema, req.body);
    const current = await loadZone(req.params.id);

    const nextActive = data.active ?? current.active;
    const nextCountries = data.countries ?? current.countries;
    if (nextActive) await assertNoCountryConflict(nextCountries, current.id);

    const zone = await prisma.shippingZone.update({ where: { id: current.id }, data, include: { rates: true } });
    clearInternationalQuoteCache();
    res.json(serializeZone(zone));
  })
);

shippingAdminRouter.delete(
  "/zones/:id",
  asyncHandler(async (req, res) => {
    const zone = await loadZone(req.params.id);
    await prisma.shippingZone.delete({ where: { id: zone.id } }); // faixas saem em cascata
    clearInternationalQuoteCache();
    res.status(204).end();
  })
);

shippingAdminRouter.post(
  "/zones/:id/rates",
  asyncHandler(async (req, res) => {
    const zone = await loadZone(req.params.id);
    const data = parse(createRateSchema, req.body);
    if (!daysAreOrdered(data.deliveryDaysMin, data.deliveryDaysMax)) throw new HttpError(400, DAYS_ORDER_MESSAGE);
    await assertNoRateConflict(zone.id, data.serviceName, data.maxWeightG);

    try {
      const rate = await prisma.shippingRate.create({
        data: {
          zoneId: zone.id,
          serviceName: data.serviceName,
          maxWeightG: data.maxWeightG,
          priceBRL: data.priceBRL.toFixed(2),
          deliveryDaysMin: data.deliveryDaysMin ?? null,
          deliveryDaysMax: data.deliveryDaysMax ?? null,
          active: data.active,
        },
      });
      clearInternationalQuoteCache();
      res.status(201).json(serializeRate(rate));
    } catch (err) {
      translateUniqueViolation(err, data.serviceName, data.maxWeightG);
    }
  })
);

shippingAdminRouter.patch(
  "/zones/:id/rates/:rateId",
  asyncHandler(async (req, res) => {
    const zone = await loadZone(req.params.id);
    const current = zone.rates.find((rate) => rate.id === req.params.rateId);
    if (!current) throw new HttpError(404, "Faixa não encontrada");

    const data = parse(updateRateSchema, req.body);
    const nextMin = data.deliveryDaysMin !== undefined ? data.deliveryDaysMin : current.deliveryDaysMin;
    const nextMax = data.deliveryDaysMax !== undefined ? data.deliveryDaysMax : current.deliveryDaysMax;
    if (!daysAreOrdered(nextMin, nextMax)) throw new HttpError(400, DAYS_ORDER_MESSAGE);

    const serviceName = data.serviceName ?? current.serviceName;
    const maxWeightG = data.maxWeightG ?? current.maxWeightG;
    await assertNoRateConflict(zone.id, serviceName, maxWeightG, current.id);

    try {
      const rate = await prisma.shippingRate.update({
        where: { id: current.id },
        data: {
          serviceName,
          maxWeightG,
          ...(data.priceBRL !== undefined ? { priceBRL: data.priceBRL.toFixed(2) } : {}),
          deliveryDaysMin: nextMin,
          deliveryDaysMax: nextMax,
          ...(data.active !== undefined ? { active: data.active } : {}),
        },
      });
      clearInternationalQuoteCache();
      res.json(serializeRate(rate));
    } catch (err) {
      translateUniqueViolation(err, serviceName, maxWeightG);
    }
  })
);

shippingAdminRouter.delete(
  "/zones/:id/rates/:rateId",
  asyncHandler(async (req, res) => {
    const zone = await loadZone(req.params.id);
    const current = zone.rates.find((rate) => rate.id === req.params.rateId);
    if (!current) throw new HttpError(404, "Faixa não encontrada");

    await prisma.shippingRate.delete({ where: { id: current.id } });
    clearInternationalQuoteCache();
    res.status(204).end();
  })
);

// "Testar destino": roda o MESMO provedor que o comprador usa, para um país e
// um peso total (embalagem incluída) em gramas. Não passa pelo cache.
shippingAdminRouter.post(
  "/simulate",
  asyncHandler(async (req, res) => {
    const { country, weightGrams } = parse(simulateSchema, req.body);
    const { box } = getShipmentConfig(env);

    const providerResult = await new InternationalTableProvider().calculate({
      originPostalCode: "",
      destinationPostalCode: "",
      destinationCountry: country,
      shipment: { box: { ...box }, weightGrams, insuranceValueBRL: 0 },
    });
    res.json({ weightGrams, result: buildInternationalResult(country, "", providerResult) });
  })
);
