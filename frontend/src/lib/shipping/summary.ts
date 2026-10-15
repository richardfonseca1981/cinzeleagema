import { issueFromUnavailableReason } from "./errors";
import { isQuoteValid, type StoredShipping } from "./storage";
import type { ArrangeSummaryReason, ShippingOption } from "./types";

// Como o frete entra no resumo (carrinho, checkout e mensagem do WhatsApp).
//  - none: não há frete utilizável para ESTE carrinho (sem cotação, carrinho
//    mudou, falha técnica sem escolha). O pedido não pode ser confirmado só
//    com isso: o checkout recalcula na hora, ou o comprador resolve a falha.
//  - quoted: opção escolhida; valor DEFINITIVO (Brasil e exterior)
//  - arrange: frete "a combinar" permitido (over_limits, país sem tarifa,
//    dados incompletos de produto) ou escolhido pelo comprador depois de uma
//    falha técnica.
// `fresh`: a cotação tem menos de 10 minutos. Sem `fresh`, o valor ainda
// aparece, mas é recalculado no clique de confirmar.
export type ShippingSummary =
  | { kind: "none" }
  | { kind: "quoted"; option: ShippingOption; international: boolean; taxesNotIncluded: boolean; fresh: boolean }
  | { kind: "arrange"; reason: ArrangeSummaryReason; international: boolean; fresh: boolean };

export type UsableShippingSummary = Exclude<ShippingSummary, { kind: "none" }>;

export function resolveShippingSummary(stored: StoredShipping | null, signature: string, now: number): ShippingSummary {
  if (!stored) return { kind: "none" };
  const international = stored.country !== "BR";

  // Escolha explícita depois de uma falha técnica (mesmo carrinho).
  if (stored.arrangeChoice && stored.arrangeChoice.signature === signature) {
    return { kind: "arrange", reason: "technical_choice", international, fresh: true };
  }

  const quote = stored.quote;
  // Cotação de outro carrinho nunca é mostrada (o valor não é deste pedido).
  if (!quote || quote.signature !== signature) return { kind: "none" };
  const fresh = isQuoteValid(quote, signature, now);

  const { unavailable } = quote.result;
  if (unavailable) {
    const issue = issueFromUnavailableReason(unavailable.reason);
    return issue.type === "arrange" ? { kind: "arrange", reason: issue.reason, international, fresh } : { kind: "none" };
  }

  const option = quote.result.options.find((o) => o.id === stored.selection);
  if (!option) return { kind: "none" };
  return {
    kind: "quoted",
    option,
    international,
    taxesNotIncluded: international || quote.result.notice === "taxes_not_included",
    fresh,
  };
}

// Mesmo resultado para o comprador? (mesma opção e mesmo valor, ou mesmo motivo de "a combinar")
export function sameShipping(a: ShippingSummary, b: ShippingSummary): boolean {
  if (a.kind === "quoted" && b.kind === "quoted") return a.option.id === b.option.id && a.option.priceBRL === b.option.priceBRL;
  if (a.kind === "arrange" && b.kind === "arrange") return a.reason === b.reason;
  return false;
}

export function shippingAmountBRL(summary: ShippingSummary): number | null {
  return summary.kind === "quoted" ? summary.option.priceBRL : null;
}

export interface MessageDestination {
  country: string;
  postalCode: string;
  city: string | null;
  state: string | null;
}

// Destino mostrado na mensagem: só quando há frete utilizável.
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

