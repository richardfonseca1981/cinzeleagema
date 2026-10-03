import type { ShippingQuoteResult } from "./types";

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  result: ShippingQuoteResult;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

// Chave = país + CEP + itens e quantidades (ordem estável, para que o mesmo
// carrinho em ordens diferentes ainda bata no cache).
export function buildQuoteCacheKey(
  country: string,
  postalCode: string,
  items: { productId: string; quantity: number }[]
): string {
  const normalizedItems = items
    .map((item) => `${item.productId}:${item.quantity}`)
    .sort()
    .join("|");
  return `${country}|${postalCode}|${normalizedItems}`;
}

export function getCachedQuote(key: string): ShippingQuoteResult | null {
  const entry = store.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }

  return entry.result;
}

export function setCachedQuote(key: string, result: ShippingQuoteResult): void {
  store.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Exposto só para os testes resetarem o estado do módulo entre casos.
export function __resetShippingQuoteCacheForTests(): void {
  store.clear();
}
