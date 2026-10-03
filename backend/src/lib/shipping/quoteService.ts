import { prisma } from "../prisma";
import { env } from "../env";
import { HttpError } from "../../middleware/errorHandler";
import { estimatePackage } from "./packageEstimator";
import { createMelhorEnvioProviderFromEnv } from "./melhorEnvioProvider";
import { buildQuoteCacheKey, getCachedQuote, setCachedQuote } from "./quoteCache";
import { lookupPostalCode } from "./viaCep";
import type { ShippingCalculationItem, ShippingQuoteResult, ShippingUnavailableReason } from "./types";

export interface ShippingQuoteRequestItem {
  productId: string;
  quantity: number;
}

function buildUnavailableResult(
  country: string,
  postalCode: string,
  reason: ShippingUnavailableReason,
  city: string | null = null,
  state: string | null = null
): ShippingQuoteResult {
  return {
    destination: { country, postalCode, city, state },
    mode: "domestic",
    options: [],
    requiresConfirmation: false,
    notice: null,
    unavailable: { reason },
  };
}

// País diferente de BR: nesta parte (1A), o frete internacional ainda não
// foi implementado (Parte 1B) — responde indisponível sem consultar banco
// nem qualquer provedor. O contrato de resposta já reflete o que o
// frontend deve fazer nesse caso (avisar sobre impostos e exigir
// confirmação manual).
function buildInternationalPlaceholderResult(country: string, postalCode: string): ShippingQuoteResult {
  return {
    destination: { country, postalCode, city: null, state: null },
    mode: "international",
    options: [],
    requiresConfirmation: true,
    notice: "taxes_not_included",
    unavailable: { reason: "not_configured" },
  };
}

export async function getShippingQuote(
  country: string,
  postalCode: string,
  items: ShippingQuoteRequestItem[]
): Promise<ShippingQuoteResult> {
  const cacheKey = buildQuoteCacheKey(country, postalCode, items);
  const cached = getCachedQuote(cacheKey);
  if (cached) return cached;

  if (country !== "BR") {
    const result = buildInternationalPlaceholderResult(country, postalCode);
    setCachedQuote(cacheKey, result);
    return result;
  }

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

  const estimatorConfig = {
    paddingCm: env.SHIPPING_PADDING_CM,
    packagingWeightG: env.SHIPPING_PACKAGING_WEIGHT_G,
  };

  const calculationItems: ShippingCalculationItem[] = [];
  for (const item of items) {
    const product = productById.get(item.productId)!;
    const estimate = estimatePackage(
      {
        weightGrams: Number(product.weightGrams),
        sizeCm: Number(product.sizeCm),
        packageLengthCm: product.packageLengthCm !== null ? Number(product.packageLengthCm) : null,
        packageWidthCm: product.packageWidthCm !== null ? Number(product.packageWidthCm) : null,
        packageHeightCm: product.packageHeightCm !== null ? Number(product.packageHeightCm) : null,
      },
      estimatorConfig
    );

    if (!estimate.ok) {
      const result = buildUnavailableResult(country, postalCode, estimate.reason);
      setCachedQuote(cacheKey, result);
      return result;
    }

    calculationItems.push({
      productId: item.productId,
      quantity: item.quantity,
      unitPriceBRL: Number(product.price),
      package: estimate.package,
    });
  }

  const provider = createMelhorEnvioProviderFromEnv({
    MELHOR_ENVIO_TOKEN: env.MELHOR_ENVIO_TOKEN,
    MELHOR_ENVIO_USER_AGENT: env.MELHOR_ENVIO_USER_AGENT,
    MELHOR_ENVIO_SANDBOX: env.MELHOR_ENVIO_SANDBOX,
  });

  if (!provider || !env.SHIPPING_ORIGIN_CEP) {
    const result = buildUnavailableResult(country, postalCode, "not_configured");
    setCachedQuote(cacheKey, result);
    return result;
  }

  const [providerResult, destinationInfo] = await Promise.all([
    provider.calculate({
      originPostalCode: env.SHIPPING_ORIGIN_CEP,
      destinationPostalCode: postalCode,
      items: calculationItems,
    }),
    lookupPostalCode(postalCode),
  ]);

  const result: ShippingQuoteResult = providerResult.ok
    ? {
        destination: { country, postalCode, city: destinationInfo.city, state: destinationInfo.state },
        mode: "domestic",
        options: providerResult.options,
        requiresConfirmation: false,
        notice: null,
        unavailable: null,
      }
    : buildUnavailableResult(country, postalCode, providerResult.reason, destinationInfo.city, destinationInfo.state);

  setCachedQuote(cacheKey, result);
  return result;
}
