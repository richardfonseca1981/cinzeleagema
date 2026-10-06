import { prisma } from "../prisma";
import { env } from "../env";
import { HttpError } from "../../middleware/errorHandler";
import { computeShipment, getShipmentConfig, type ShipmentItem } from "./shipment";
import { createMelhorEnvioProviderFromEnv } from "./melhorEnvioProvider";
import { buildQuoteCacheKey, getCachedQuote, setCachedQuote } from "./quoteCache";
import { lookupPostalCode } from "./viaCep";
import { InternationalTableProvider } from "./internationalProvider";
import type { ShippingProviderResult, ShippingQuoteResult, ShippingUnavailableReason } from "./types";

export interface ShippingQuoteRequestItem {
  productId: string;
  quantity: number;
}

// Todo destino fora do Brasil é "international" e leva o aviso de impostos de
// importação — inclusive quando o frete fica indisponível/"a combinar".
export function buildUnavailableResult(
  country: string,
  postalCode: string,
  reason: ShippingUnavailableReason,
  city: string | null = null,
  state: string | null = null
): ShippingQuoteResult {
  const international = country !== "BR";
  return {
    destination: { country, postalCode, city, state },
    mode: international ? "international" : "domestic",
    options: [],
    requiresConfirmation: false,
    notice: international ? "taxes_not_included" : null,
    unavailable: { reason },
  };
}

// Resposta do provedor internacional no contrato público. As opções são
// DEFINITIVAS (requiresConfirmation sempre false) e o aviso de impostos vale
// em qualquer resultado fora do Brasil.
export function buildInternationalResult(
  country: string,
  postalCode: string,
  providerResult: ShippingProviderResult
): ShippingQuoteResult {
  if (!providerResult.ok) return buildUnavailableResult(country, postalCode, providerResult.reason);
  return {
    destination: { country, postalCode, city: null, state: null },
    mode: "international",
    options: providerResult.options,
    requiresConfirmation: false,
    notice: "taxes_not_included",
    unavailable: null,
  };
}

// Falha técnica nunca entra no cache: o comprador toca em "Tentar de novo" e
// precisa de uma consulta nova, não da mesma falha por mais 10 minutos.
const TECHNICAL_FAILURES: ReadonlySet<ShippingUnavailableReason> = new Set(["provider_error", "not_configured"]);

function cacheQuote(key: string, result: ShippingQuoteResult): void {
  if (result.unavailable && TECHNICAL_FAILURES.has(result.unavailable.reason)) return;
  setCachedQuote(key, result);
}

export async function getShippingQuote(
  country: string,
  postalCode: string,
  items: ShippingQuoteRequestItem[]
): Promise<ShippingQuoteResult> {
  const cacheKey = buildQuoteCacheKey(country, postalCode, items);
  const cached = getCachedQuote(cacheKey);
  if (cached) return cached;

  // Nunca confia em peso/preço/dimensões vindos do cliente — busca tudo no
  // banco pelo productId.
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product || !product.active) {
      throw new HttpError(400, `Produto ${item.productId} não encontrado ou inativo`);
    }
  }

  // Campos packageLength/Width/HeightCm do produto são obsoletos: o pedido é
  // sempre uma única caixa fixa (shipment.ts). Vale para Brasil e exterior.
  const shipmentItems: ShipmentItem[] = items.map((item) => {
    const product = productById.get(item.productId)!;
    return {
      weightGrams: Number(product.weightGrams),
      sizeCm: Number(product.sizeCm),
      quantity: item.quantity,
      unitPriceBRL: Number(product.price),
    };
  });

  if (country !== "BR") {
    // Fora do Brasil: tabela cadastrada pelo cliente (sem API externa).
    const providerResult = await new InternationalTableProvider().calculateForItems(
      country,
      shipmentItems,
      getShipmentConfig(env)
    );
    const result = buildInternationalResult(country, postalCode, providerResult);
    cacheQuote(cacheKey, result);
    return result;
  }

  const computed = computeShipment(shipmentItems, getShipmentConfig(env));
  if (!computed.ok) {
    const result = buildUnavailableResult(country, postalCode, computed.reason);
    cacheQuote(cacheKey, result);
    return result;
  }

  const provider = createMelhorEnvioProviderFromEnv({
    MELHOR_ENVIO_TOKEN: env.MELHOR_ENVIO_TOKEN,
    MELHOR_ENVIO_USER_AGENT: env.MELHOR_ENVIO_USER_AGENT,
    MELHOR_ENVIO_SANDBOX: env.MELHOR_ENVIO_SANDBOX,
  });

  if (!provider || !env.SHIPPING_ORIGIN_CEP) {
    const result = buildUnavailableResult(country, postalCode, "not_configured");
    cacheQuote(cacheKey, result);
    return result;
  }

  const [providerResult, destinationInfo] = await Promise.all([
    provider.calculate({
      originPostalCode: env.SHIPPING_ORIGIN_CEP,
      destinationPostalCode: postalCode,
      shipment: computed.shipment,
    }),
    lookupPostalCode(postalCode),
  ]);

  const result: ShippingQuoteResult = providerResult.ok
    ? {
        destination: { country, postalCode, city: destinationInfo.city, state: destinationInfo.state },
        mode: "domestic" as const,
        options: providerResult.options,
        requiresConfirmation: false,
        notice: null,
        unavailable: null,
      }
    : buildUnavailableResult(country, postalCode, providerResult.reason, destinationInfo.city, destinationInfo.state);

  cacheQuote(cacheKey, result);
  return result;
}
