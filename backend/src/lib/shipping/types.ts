// Contrato compartilhado entre qualquer ShippingProvider (nacional ou
// internacional) e o endpoint público POST /api/shipping/quote. Não depende
// de env/prisma/fetch — só tipos, para a Parte 1B (frete internacional)
// poder implementar um novo provider sem alterar nada aqui.

export type ShippingUnavailableReason =
  | "provider_error"
  | "no_rates_configured"
  | "invalid_destination"
  | "over_limits"
  | "incomplete_product_data"
  | "not_configured";

export interface ShippingOption {
  id: string;
  carrier: string;
  service: string;
  priceBRL: number;
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
  kind: "quoted" | "estimated";
}

export interface EstimatedPackage {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightGrams: number;
}

export interface ShippingCalculationItem {
  productId: string;
  quantity: number;
  // Preço unitário em BRL — usado como valor declarado/segurado junto ao
  // provedor, nunca confiar no que o cliente envia (ver quoteService.ts).
  unitPriceBRL: number;
  package: EstimatedPackage;
}

export interface ShippingCalculationInput {
  originPostalCode: string;
  destinationPostalCode: string;
  items: ShippingCalculationItem[];
}

export type ShippingProviderResult = { ok: true; options: ShippingOption[] } | { ok: false; reason: ShippingUnavailableReason };

// Implementado por MelhorEnvioProvider (nacional, Parte 1A) e, futuramente,
// por um provider internacional (Parte 1B) — o endpoint e o contrato de
// resposta da API pública não mudam entre eles.
export interface ShippingProvider {
  calculate(input: ShippingCalculationInput): Promise<ShippingProviderResult>;
}

// Contrato de resposta de POST /api/shipping/quote — consumido pelo
// frontend na Parte 2. Nunca contém texto pronto em nenhum idioma: o
// frontend traduz a partir dos códigos (mode/kind/notice/unavailable.reason).
export interface ShippingQuoteResult {
  destination: { country: string; postalCode: string; city: string | null; state: string | null };
  mode: "domestic" | "international";
  options: ShippingOption[];
  requiresConfirmation: boolean;
  notice: "taxes_not_included" | null;
  unavailable: null | { reason: ShippingUnavailableReason };
}
