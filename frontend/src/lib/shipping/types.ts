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

// Escolha "prefiro combinar o frete pelo WhatsApp" (não é uma opção da API).
export const ARRANGE_OPTION_ID = "__arrange__";
