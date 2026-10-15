import type { ArrangeReason, TechnicalCause } from "./types";
import { ARRANGE_REASONS } from "./types";

// O que a interface oferece depois de cada situação (nunca uma tela morta).
//  - retry: "Tentar de novo"
//  - closeArranged: "Fechar o pedido com frete a combinar" (só depois de falha técnica)
export type ShippingAction = "retry" | "checkPostalCode" | "reviewCart" | "closeArranged";

export interface ShippingMessage {
  // chave em pt-BR.json / en.json
  messageKey: string;
  actions: ShippingAction[];
}

// Falhas da chamada em si (rede, timeout, 429, 4xx/5xx).
export type ShippingErrorKind =
  | "rate_limited"
  | "invalid_postal_code"
  | "product_unavailable"
  | "network"
  | "timeout"
  | "server";

// O que uma resposta/falha significa para o pedido:
//  - arrange: frete "a combinar" automático, o comprador pode confirmar;
//  - technical: falha técnica — só confirma se escolher "a combinar" explicitamente;
//  - invalid_destination: CEP inválido — corrigir o CEP, nunca "a combinar";
//  - product_unavailable: peça saiu do catálogo — revisar o pedido.
export type ShippingIssue =
  | { type: "arrange"; reason: ArrangeReason }
  | { type: "technical"; cause: TechnicalCause }
  | { type: "invalid_destination" }
  | { type: "product_unavailable" };

export function issueFromUnavailableReason(reason: string): ShippingIssue {
  if ((ARRANGE_REASONS as readonly string[]).includes(reason)) return { type: "arrange", reason: reason as ArrangeReason };
  if (reason === "invalid_destination") return { type: "invalid_destination" };
  if (reason === "not_configured") return { type: "technical", cause: "not_configured" };
  // provider_error e qualquer código novo/desconhecido: falha técnica
  return { type: "technical", cause: "provider_error" };
}

export function issueFromError(kind: ShippingErrorKind): ShippingIssue {
  if (kind === "invalid_postal_code") return { type: "invalid_destination" };
  if (kind === "product_unavailable") return { type: "product_unavailable" };
  return { type: "technical", cause: kind };
}

export function describeIssue(issue: ShippingIssue): ShippingMessage {
  switch (issue.type) {
    case "arrange":
      return { messageKey: `shipping.issue.${issue.reason}`, actions: [] };
    case "technical":
      return { messageKey: `shipping.issue.${issue.cause}`, actions: ["retry", "closeArranged"] };
    case "invalid_destination":
      return { messageKey: "shipping.issue.invalid_destination", actions: ["checkPostalCode"] };
    case "product_unavailable":
      return { messageKey: "shipping.issue.product_unavailable", actions: ["reviewCart"] };
  }
}

export class ShippingTimeoutError extends Error {
  constructor() {
    super("Tempo esgotado ao calcular o frete");
    this.name = "ShippingTimeoutError";
  }
}

// Sem depender de lib/api (ApiError tem `status`): classifica por duck typing.
export function classifyShippingError(err: unknown): ShippingErrorKind {
  if (err instanceof ShippingTimeoutError) return "timeout";

  const status = (err as { status?: unknown } | null)?.status;
  const message = String((err as { message?: unknown } | null)?.message ?? "");

  if (typeof status === "number") {
    if (status === 429) return "rate_limited";
    if (status === 400) {
      if (/CEP inv[aá]lido/i.test(message)) return "invalid_postal_code";
      if (/Produto .*(n[ãa]o encontrado|inativo)/i.test(message)) return "product_unavailable";
      return "server";
    }
    return "server";
  }

  // fetch() sem resposta (offline, DNS, CORS...) lança TypeError
  if (err instanceof TypeError) return "network";
  if ((err as { name?: string } | null)?.name === "AbortError") return "timeout";
  return "network";
}

// Quanto tempo o botão "Tentar de novo" fica desativado depois de um 429
// (limite: 20/min por IP).
export const RATE_LIMIT_COOLDOWN_MS = 15_000;
// Tempo máximo de espera pela cotação.
export const QUOTE_TIMEOUT_MS = 15_000;
