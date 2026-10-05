import { isQuoteValid, type StoredShipping } from "./storage";
import { ARRANGE_OPTION_ID, type ShippingOption } from "./types";

// Como o frete entra no resumo (carrinho, checkout e mensagem do WhatsApp).
//  - none: o comprador ainda não escolheu (pode seguir assim — "a combinar")
//  - arrange: escolheu combinar pelo WhatsApp (ou país sem tabela)
//  - stale: a cotação venceu (carrinho mudou ou passaram 30 min): avisar, sem bloquear
//  - quoted / estimated: opção escolhida e válida
export type ShippingSummary =
  | { kind: "none" }
  | { kind: "arrange"; international: boolean }
  | { kind: "stale"; international: boolean }
  | { kind: "quoted" | "estimated"; option: ShippingOption; international: boolean; taxesNotIncluded: boolean };

export function resolveShippingSummary(stored: StoredShipping | null, signature: string, now: number): ShippingSummary {
  if (!stored || !stored.selection) return { kind: "none" };
  const international = stored.country !== "BR";

  if (stored.selection === ARRANGE_OPTION_ID) return { kind: "arrange", international };

  const option = stored.quote?.result.options.find((o) => o.id === stored.selection);
  if (!stored.quote || !option) return { kind: "none" };
  if (!isQuoteValid(stored.quote, signature, now)) return { kind: "stale", international };

  return {
    kind: option.kind === "estimated" ? "estimated" : "quoted",
    option,
    international,
    taxesNotIncluded: international || stored.quote.result.notice === "taxes_not_included",
  };
}

export function shippingAmountBRL(summary: ShippingSummary): number | null {
  return summary.kind === "quoted" || summary.kind === "estimated" ? summary.option.priceBRL : null;
}

export interface MessageDestination {
  country: string;
  postalCode: string;
  city: string | null;
  state: string | null;
}

// Destino mostrado na mensagem: só quando o comprador de fato escolheu algo.
export function destinationFor(stored: StoredShipping | null, summary: ShippingSummary): MessageDestination | null {
  if (!stored || summary.kind === "none") return null;
  // Cidade/UF da cotação só valem se ela é do mesmo país do destino atual.
  const fromQuote = stored.quote?.result.destination;
  const quoteMatches = fromQuote?.country === stored.country;
  return {
    country: stored.country,
    postalCode: stored.postalCode,
    city: stored.city ?? (quoteMatches ? fromQuote?.city ?? null : null),
    state: stored.state ?? (quoteMatches ? fromQuote?.state ?? null : null),
  };
}
