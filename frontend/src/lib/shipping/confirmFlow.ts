import { cartSignature } from "./cartSignature";
import { classifyShippingError, issueFromError, issueFromUnavailableReason, type ShippingIssue } from "./errors";
import { selectionAfterQuote } from "./options";
import { digitsOnly, isCompleteBrazilianPostalCode } from "./postalCode";
import type { StoredShipping } from "./storage";
import { resolveShippingSummary, sameShipping, type ShippingSummary, type UsableShippingSummary } from "./summary";
import type { ShippingQuoteRequest, ShippingQuoteResult, TechnicalCause } from "./types";

// O que o comprador pode fazer com o pedido, a partir do frete (máquina de
// estados do frete definitivo). Regra de produto: o pedido SÓ é confirmado com
//  1) frete cotado e válido (opção escolhida, mesmo carrinho, menos de 10 min);
//  2) frete "a combinar" permitido: over_limits, país sem tarifa
//     (no_rates_configured) e incomplete_product_data;
//  3) falha técnica em que o COMPRADOR escolheu "Fechar o pedido com frete a
//     combinar" depois de ver a falha.
// CEP inválido nunca vira "a combinar".

export type DestinationState = "complete" | "incomplete";

export function destinationState(country: string, postalCode: string): DestinationState {
  if (country === "BR") return isCompleteBrazilianPostalCode(postalCode) ? "complete" : "incomplete";
  return country.length === 2 ? "complete" : "incomplete"; // código postal é opcional no exterior
}

// Pode confirmar sem consultar nada? (cotada/a combinar e ainda dentro dos 10 min)
export function isReadyToConfirm(summary: ShippingSummary): summary is UsableShippingSummary {
  return summary.kind !== "none" && summary.fresh;
}

// Pode ir para o checkout a partir do carrinho? Precisa haver frete utilizável
// (mesmo vencido: o checkout recalcula no clique de confirmar).
export function canProceedToCheckout(summary: ShippingSummary): boolean {
  return summary.kind !== "none";
}

// Grava no estado persistido uma cotação nova e a escolha resultante.
export function applyQuote(stored: StoredShipping, result: ShippingQuoteResult, signature: string, now: number): StoredShipping {
  return {
    ...stored,
    quote: { result, signature, savedAt: now },
    selection: selectionAfterQuote(result, stored.selection),
    arrangeChoice: null, // cotação nova substitui qualquer escolha anterior
  };
}

// Escolha explícita do comprador de fechar com frete a combinar depois de uma falha técnica.
export function withArrangeChoice(stored: StoredShipping, signature: string, cause: TechnicalCause, now: number): StoredShipping {
  return { ...stored, arrangeChoice: { signature, cause, chosenAt: now } };
}

// Mudança entre o frete que estava na tela e o recalculado.
export type ShippingChange =
  | { kind: "price"; fromBRL: number; toBRL: number }
  | { kind: "calculated"; toBRL: number; label: { carrier: string; service: string } }
  | { kind: "arrange"; reason: Extract<UsableShippingSummary, { kind: "arrange" }>["reason"] };

export function describeChange(from: ShippingSummary, to: UsableShippingSummary): ShippingChange {
  if (to.kind === "arrange") return { kind: "arrange", reason: to.reason };
  if (from.kind === "quoted" && from.option.id === to.option.id) {
    return { kind: "price", fromBRL: from.option.priceBRL, toBRL: to.option.priceBRL };
  }
  return { kind: "calculated", toBRL: to.option.priceBRL, label: { carrier: to.option.carrier, service: to.option.service } };
}

export type ConfirmOutcome =
  // frete válido: pode abrir o WhatsApp/enviar o pedido
  | { type: "send"; stored: StoredShipping; summary: UsableShippingSummary }
  // recalculou e o frete mudou (ou não havia valor na tela): mostrar e exigir novo clique
  | { type: "changed"; stored: StoredShipping; summary: UsableShippingSummary; change: ShippingChange }
  // falha técnica: mensagem + "Tentar de novo" / "Fechar o pedido com frete a combinar"
  | { type: "technical_failure"; cause: TechnicalCause }
  // CEP inválido ou peça indisponível: corrigir
  | { type: "blocked"; issue: Extract<ShippingIssue, { type: "invalid_destination" | "product_unavailable" }> }
  // sem país/CEP completos para calcular: voltar ao carrinho
  | { type: "needs_destination" }
  // resposta atrasada: ignorada
  | { type: "discarded" };

export interface ConfirmDeps {
  fetchQuote: (request: ShippingQuoteRequest) => Promise<ShippingQuoteResult>;
  now: () => number;
  // false quando uma requisição mais nova começou: a resposta desta é descartada
  isCurrent: () => boolean;
}

export interface ConfirmItem {
  productId: string;
  quantity: number;
}

// Executado no clique de confirmar, ANTES de abrir o WhatsApp. Se a cotação
// estiver ausente, vencida (mais de 10 minutos) ou for de outro carrinho,
// recalcula na hora. Só devolve "send" quando o frete recalculado é igual ao
// que o comprador estava vendo; qualquer diferença exige um novo clique.
export async function confirmShipping(stored: StoredShipping, items: ConfirmItem[], deps: ConfirmDeps): Promise<ConfirmOutcome> {
  const signature = cartSignature(items);
  const displayed = resolveShippingSummary(stored, signature, deps.now());
  if (isReadyToConfirm(displayed)) return { type: "send", stored, summary: displayed };

  if (destinationState(stored.country, stored.postalCode) !== "complete") return { type: "needs_destination" };

  let result: ShippingQuoteResult;
  try {
    const postalCode = stored.country === "BR" ? digitsOnly(stored.postalCode) : stored.postalCode.trim();
    result = await deps.fetchQuote({
      country: stored.country,
      ...(postalCode ? { postalCode } : {}),
      items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    });
  } catch (err) {
    if (!deps.isCurrent()) return { type: "discarded" };
    return outcomeForIssue(issueFromError(classifyShippingError(err)));
  }
  if (!deps.isCurrent()) return { type: "discarded" };

  if (result.unavailable) {
    const issue = issueFromUnavailableReason(result.unavailable.reason);
    if (issue.type !== "arrange") return outcomeForIssue(issue);
  }

  const next = applyQuote(stored, result, signature, deps.now());
  const summary = resolveShippingSummary(next, signature, deps.now());
  if (summary.kind === "none") return { type: "technical_failure", cause: "server" }; // resposta sem opção escolhível
  if (sameShipping(displayed, summary)) return { type: "send", stored: next, summary };
  return { type: "changed", stored: next, summary, change: describeChange(displayed, summary) };
}

function outcomeForIssue(issue: ShippingIssue): ConfirmOutcome {
  if (issue.type === "technical") return { type: "technical_failure", cause: issue.cause };
  if (issue.type === "arrange") return { type: "technical_failure", cause: "server" }; // inalcançável: tratado antes
  return { type: "blocked", issue };
}
