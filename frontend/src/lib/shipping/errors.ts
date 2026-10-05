import { UNAVAILABLE_REASONS, type ShippingUnavailableReason } from "./types";

// O que a interface oferece depois de cada situação (nunca uma tela morta).
export type ShippingAction = "retry" | "checkPostalCode" | "reviewCart" | "arrange";

export interface ShippingMessage {
  // chave em pt-BR.json / en.json
  messageKey: string;
  actions: ShippingAction[];
}

// Cada unavailable.reason devolvido pela API → mensagem humana + próxima ação.
export const UNAVAILABLE_MESSAGES: Record<ShippingUnavailableReason, ShippingMessage> = {
  provider_error: { messageKey: "shipping.unavailable.provider_error", actions: ["retry", "arrange"] },
  no_rates_configured: { messageKey: "shipping.unavailable.no_rates_configured", actions: ["arrange"] },
  invalid_destination: { messageKey: "shipping.unavailable.invalid_destination", actions: ["checkPostalCode", "arrange"] },
  over_limits: { messageKey: "shipping.unavailable.over_limits", actions: ["arrange"] },
  incomplete_product_data: { messageKey: "shipping.unavailable.incomplete_product_data", actions: ["arrange"] },
  not_configured: { messageKey: "shipping.unavailable.not_configured", actions: ["arrange"] },
};

export function describeUnavailable(reason: string): ShippingMessage {
  return (UNAVAILABLE_REASONS as readonly string[]).includes(reason)
    ? UNAVAILABLE_MESSAGES[reason as ShippingUnavailableReason]
    : UNAVAILABLE_MESSAGES.provider_error; // código novo/desconhecido: trata como falha do provedor
}

// Falhas da chamada em si (rede, timeout, 429, 4xx/5xx).
export type ShippingErrorKind =
  | "rate_limited"
  | "invalid_postal_code"
  | "product_unavailable"
  | "network"
  | "timeout"
  | "server";

export const ERROR_MESSAGES: Record<ShippingErrorKind, ShippingMessage> = {
  rate_limited: { messageKey: "shipping.error.rate_limited", actions: ["arrange"] },
  invalid_postal_code: { messageKey: "shipping.error.invalid_postal_code", actions: ["checkPostalCode", "arrange"] },
  product_unavailable: { messageKey: "shipping.error.product_unavailable", actions: ["reviewCart", "arrange"] },
  network: { messageKey: "shipping.error.network", actions: ["retry", "arrange"] },
  timeout: { messageKey: "shipping.error.timeout", actions: ["retry", "arrange"] },
  server: { messageKey: "shipping.error.server", actions: ["retry", "arrange"] },
};

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

// Quanto tempo o botão fica desativado depois de um 429 (limite: 20/min por IP).
export const RATE_LIMIT_COOLDOWN_MS = 15_000;
// Tempo máximo de espera pela cotação.
export const QUOTE_TIMEOUT_MS = 15_000;
