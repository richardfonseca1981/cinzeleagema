// Contrato da API pública de frete (backend/src/lib/shipping/types.ts e
// routes/shipping.routes.ts). A API nunca devolve texto pronto: a interface
// traduz a partir dos códigos (mode / kind / notice / unavailable.reason).

export const UNAVAILABLE_REASONS = [
  "provider_error",
  "no_rates_configured",
  "invalid_destination",
  "over_limits",
  "incomplete_product_data",
  "not_configured",
] as const;

export type ShippingUnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export interface ShippingOption {
  id: string;
  carrier: string;
  service: string;
  priceBRL: number;
  // Prazo em dias. A documentação do provedor (Melhor Envio) não pôde ser
  // consultada, então NÃO se afirma "dias úteis" na tela — só "dias".
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
  // Frete DEFINITIVO: o valor devolvido (Melhor Envio ou tabela do cliente) é o
  // valor final. A interface não distingue "estimated" (legado do contrato).
  kind: "quoted" | "estimated";
}

export interface ShippingQuoteResult {
  destination: { country: string; postalCode: string; city: string | null; state: string | null };
  mode: "domestic" | "international";
  options: ShippingOption[];
  requiresConfirmation: boolean;
  notice: "taxes_not_included" | null;
  unavailable: null | { reason: ShippingUnavailableReason };
}

// POST /api/shipping/quote — postalCode é obrigatório só no Brasil (8 dígitos).
export interface ShippingQuoteRequest {
  country: string;
  postalCode?: string;
  items: Array<{ productId: string; quantity: number }>;
}

// GET /api/shipping/postal-code/:code (só Brasil). city/state são null quando
// o ViaCEP falha — nunca é erro.
export interface PostalCodeLookup {
  postalCode: string;
  city: string | null;
  state: string | null;
}

// Motivos em que o frete é "a combinar" SEM que o comprador precise escolher
// nada (o cálculo não se aplica): peça/pedido grande demais para a caixa ou
// acima das faixas de peso, país sem tarifa e dados incompletos de produto.
export const ARRANGE_REASONS = ["over_limits", "no_rates_configured", "incomplete_product_data"] as const;
export type ArrangeReason = (typeof ARRANGE_REASONS)[number];

// Falha técnica: só vira "a combinar" se o COMPRADOR escolher explicitamente
// "Fechar o pedido com frete a combinar" depois de ver a falha.
export type TechnicalCause = "provider_error" | "not_configured" | "rate_limited" | "network" | "timeout" | "server";

// Motivo mostrado na mensagem do WhatsApp quando o frete é a combinar: os três
// de ARRANGE_REASONS ou a escolha do comprador depois de uma falha técnica.
export type ArrangeSummaryReason = ArrangeReason | "technical_choice";
