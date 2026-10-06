import type { ShippingQuoteResult, TechnicalCause } from "./types";

// Persistência no localStorage (sempre em try/catch — pode estar indisponível).
// País e CEP persistem; a cotação só vale como frete definitivo se a assinatura
// do carrinho for a mesma e tiver menos de 10 minutos.
export const SHIPPING_STORAGE_KEY = "cinzeleagema_shipping";
// Mesmo nome e mesmo valor do cache do backend
// (QUOTE_CACHE_TTL_MS em backend/src/lib/shipping/quoteCache.ts).
export const QUOTE_CACHE_TTL_MS = 10 * 60 * 1000;

export interface StoredQuote {
  result: ShippingQuoteResult;
  signature: string;
  savedAt: number;
}

// Escolha EXPLÍCITA do comprador, depois de uma falha técnica, de fechar o
// pedido com frete a combinar. Só vale para o mesmo carrinho (assinatura) e o
// mesmo destino (trocar país/CEP a descarta).
export interface StoredArrangeChoice {
  signature: string;
  cause: TechnicalCause;
  chosenAt: number;
}

export interface StoredShipping {
  version: 2;
  country: string;
  postalCode: string;
  city: string | null;
  state: string | null;
  quote: StoredQuote | null;
  // id da opção escolhida (ou null)
  selection: string | null;
  arrangeChoice: StoredArrangeChoice | null;
}

export function emptyStoredShipping(): StoredShipping {
  return { version: 2, country: "BR", postalCode: "", city: null, state: null, quote: null, selection: null, arrangeChoice: null };
}

export function isQuoteValid(quote: StoredQuote | null, currentSignature: string, now: number): boolean {
  if (!quote) return false;
  if (quote.signature !== currentSignature) return false;
  const age = now - quote.savedAt;
  return age >= 0 && age < QUOTE_CACHE_TTL_MS;
}

const TECHNICAL_CAUSES: readonly string[] = ["provider_error", "not_configured", "rate_limited", "network", "timeout", "server"];

// Valida o que veio do disco (pode estar corrompido/antigo). A versão 1 (antes
// do frete definitivo) tinha "a combinar" por link e cotações "estimadas": só
// o destino é aproveitado — cotação e escolha antigas são descartadas.
export function parseStoredShipping(raw: string | null): StoredShipping | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as (Omit<Partial<StoredShipping>, "version"> & { version?: number }) | null;
    if (!data || (data.version !== 1 && data.version !== 2)) return null;
    if (typeof data.country !== "string" || typeof data.postalCode !== "string") return null;

    const base = {
      version: 2 as const,
      country: data.country,
      postalCode: data.postalCode,
      city: typeof data.city === "string" ? data.city : null,
      state: typeof data.state === "string" ? data.state : null,
    };
    if (data.version === 1) return { ...base, quote: null, selection: null, arrangeChoice: null };

    const quote = data.quote;
    const validQuote =
      quote &&
      typeof quote.signature === "string" &&
      typeof quote.savedAt === "number" &&
      quote.result &&
      Array.isArray(quote.result.options)
        ? quote
        : null;
    const choice = data.arrangeChoice;
    const validChoice =
      choice &&
      typeof choice.signature === "string" &&
      typeof choice.chosenAt === "number" &&
      TECHNICAL_CAUSES.includes(choice.cause)
        ? choice
        : null;
    return {
      ...base,
      quote: validQuote,
      selection: typeof data.selection === "string" ? data.selection : null,
      arrangeChoice: validChoice,
    };
  } catch {
    return null;
  }
}

export function loadStoredShipping(): StoredShipping | null {
  try {
    return parseStoredShipping(localStorage.getItem(SHIPPING_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveStoredShipping(state: StoredShipping): void {
  try {
    localStorage.setItem(SHIPPING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage indisponível — a cotação segue só em memória
  }
}

// Depois do pedido: limpa a cotação e a escolha, mantém país/CEP.
export function clearStoredQuote(): void {
  const current = loadStoredShipping();
  if (!current) return;
  saveStoredShipping({ ...current, quote: null, selection: null, arrangeChoice: null });
}
