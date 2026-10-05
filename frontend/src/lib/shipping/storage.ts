import { ARRANGE_OPTION_ID, type ShippingQuoteResult } from "./types";

// Persistência no localStorage (sempre em try/catch — pode estar indisponível).
// País e CEP persistem; a cotação só vale se a assinatura do carrinho for a
// mesma e tiver menos de 30 minutos.
export const SHIPPING_STORAGE_KEY = "cinzeleagema_shipping";
export const QUOTE_MAX_AGE_MS = 30 * 60 * 1000;

export interface StoredQuote {
  result: ShippingQuoteResult;
  signature: string;
  savedAt: number;
}

export interface StoredShipping {
  version: 1;
  country: string;
  postalCode: string;
  city: string | null;
  state: string | null;
  quote: StoredQuote | null;
  // id da opção escolhida, ARRANGE_OPTION_ID ("combinar pelo WhatsApp") ou null
  selection: string | null;
}

export function emptyStoredShipping(): StoredShipping {
  return { version: 1, country: "BR", postalCode: "", city: null, state: null, quote: null, selection: null };
}

export function isQuoteValid(quote: StoredQuote | null, currentSignature: string, now: number): boolean {
  if (!quote) return false;
  if (quote.signature !== currentSignature) return false;
  const age = now - quote.savedAt;
  return age >= 0 && age < QUOTE_MAX_AGE_MS;
}

// Valida o que veio do disco (pode estar corrompido/antigo).
export function parseStoredShipping(raw: string | null): StoredShipping | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<StoredShipping> | null;
    if (!data || data.version !== 1 || typeof data.country !== "string" || typeof data.postalCode !== "string") return null;
    const quote = data.quote;
    const validQuote =
      quote &&
      typeof quote.signature === "string" &&
      typeof quote.savedAt === "number" &&
      quote.result &&
      Array.isArray(quote.result.options)
        ? quote
        : null;
    return {
      version: 1,
      country: data.country,
      postalCode: data.postalCode,
      city: typeof data.city === "string" ? data.city : null,
      state: typeof data.state === "string" ? data.state : null,
      quote: validQuote,
      selection: typeof data.selection === "string" ? data.selection : null,
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
  saveStoredShipping({ ...current, quote: null, selection: null });
}

export function isArrangeSelection(selection: string | null): boolean {
  return selection === ARRANGE_OPTION_ID;
}
