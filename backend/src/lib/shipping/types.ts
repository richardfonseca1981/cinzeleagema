// Contrato compartilhado entre qualquer ShippingProvider (nacional ou
// internacional) e o endpoint público POST /api/shipping/quote. Não depende
// de env/prisma/fetch — só tipos.
//
// Frete DEFINITIVO (decisão do cliente): todo valor devolvido por um provedor
// (Melhor Envio no Brasil, tabela cadastrada no exterior) é o valor final do
// pedido. Nenhum provedor devolve "estimativa".

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
  // Sempre "quoted" (valor definitivo). "estimated" não é mais emitido por
  // nenhum provedor; o valor continua no contrato só por compatibilidade.
  kind: "quoted" | "estimated";
}

// Caixa fixa usada em todo pedido (ver shipment.ts).
export interface ShippingBox {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

// Um pedido = um único volume: caixa fixa, peso total (peças + embalagem) e
// valor segurado (soma dos preços reais do banco, nunca do cliente).
export interface ShippingShipment {
  box: ShippingBox;
  weightGrams: number;
  insuranceValueBRL: number;
}

export interface ShippingCalculationInput {
  originPostalCode: string;
  destinationPostalCode: string;
  // País de destino (ISO alpha-2). Opcional: o provedor nacional não usa; o
  // internacional (tabela) precisa dele para achar a zona.
  destinationCountry?: string;
  shipment: ShippingShipment;
}

export type ShippingProviderResult = { ok: true; options: ShippingOption[] } | { ok: false; reason: ShippingUnavailableReason };

// Implementado por MelhorEnvioProvider (nacional) e InternationalTableProvider
// (exterior, tabela do cliente) — o endpoint e o contrato de resposta da API
// pública não mudam entre eles.
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
  // Sempre false desde que o frete é definitivo (campo mantido no contrato).
  requiresConfirmation: boolean;
  // "taxes_not_included": em TODO destino fora do Brasil (inclusive quando
  // indisponível) — nenhum cálculo cobre impostos de importação.
  notice: "taxes_not_included" | null;
  unavailable: null | { reason: ShippingUnavailableReason };
}
