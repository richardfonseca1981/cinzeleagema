// Comissão, tarifa fixa e frete do Mercado Livre são SEMPRE parâmetros de
// entrada — esta função nunca assume um valor "real" por conta própria (ver
// ajuste pedido na aprovação do plano da Fase 1A). As constantes abaixo são
// só um ponto de partida para a tela de simulação pré-preencher o formulário.
export interface MercadoLivrePriceConfig {
  markupPct: number;
  commissionPct: number;
  fixedFeeBRL: number;
  shippingCostBRL: number;
}

// Estimativas de ponto de partida, NÃO verificadas contra a documentação
// oficial do Mercado Livre — os endpoints públicos de tarifas bloquearam a
// consulta automatizada durante o planejamento desta fase (ver
// categoryFixture.ts), então estes números vêm de agregadores de terceiros,
// não da fonte oficial. Confirmar antes de usar em qualquer precificação
// real (categoria "Joias e Relógios", faixa de preço médio).
export const UNVERIFIED_DEFAULT_COMMISSION_PCT = 12.5;
export const UNVERIFIED_DEFAULT_FIXED_FEE_BRL = 6;
// O Mercado Envios tem regras de frete próprias, diferentes da caixa fixa do
// Melhor Envio usada no site (lib/shipping/shipment.ts) — decisão explícita
// de NÃO reaproveitar aquele cálculo aqui. Sem um valor seguro para assumir
// como padrão, por isso 0: o chamador deve informar o frete real estimado.
export const UNVERIFIED_DEFAULT_SHIPPING_COST_BRL = 0;

export interface MercadoLivrePriceBreakdown {
  basePrice: number;
  markupAmount: number;
  listingPrice: number;
  commissionAmount: number;
  fixedFeeBRL: number;
  shippingCostBRL: number;
  netReceived: number;
}

export function calculateSuggestedPrice(basePrice: number, config: MercadoLivrePriceConfig): MercadoLivrePriceBreakdown {
  if (!(basePrice > 0)) throw new Error("basePrice deve ser maior que zero");

  const markupAmount = basePrice * (config.markupPct / 100);
  const listingPrice = basePrice + markupAmount;
  const commissionAmount = listingPrice * (config.commissionPct / 100);
  const netReceived = listingPrice - commissionAmount - config.fixedFeeBRL - config.shippingCostBRL;

  return {
    basePrice,
    markupAmount,
    listingPrice,
    commissionAmount,
    fixedFeeBRL: config.fixedFeeBRL,
    shippingCostBRL: config.shippingCostBRL,
    netReceived,
  };
}

// Markup mínimo (%) pra que o líquido recebido cubra pelo menos o preço base
// (ponto de equilíbrio: a comissão/tarifa/frete saem do acréscimo, não do
// preço base) — usado pelo script de simulação (scripts/simulateMercadoLivre.ts)
// pra o Felipe ver, por peça, o piso de acréscimo que não dá prejuízo frente
// ao preço já praticado hoje. Mesma ressalva de calculateSuggestedPrice:
// comissão/tarifa/frete aqui são SEMPRE o que o chamador informar, nunca
// assumidos — se vierem dos UNVERIFIED_DEFAULT_* acima, o resultado herda a
// mesma incerteza (não verificado contra a API oficial).
//
// Derivação: netReceived(markup) = basePrice sse
//   basePrice*(1+markup/100)*(1-commissionPct/100) - fixedFeeBRL - shippingCostBRL = basePrice
// Comissão >= 100%: nenhum markup finito fecha a conta — devolve Infinity
// (o chamador decide como reportar isso, nunca lança).
export function calculateMinimumMarkupForBreakeven(
  basePrice: number,
  config: Omit<MercadoLivrePriceConfig, "markupPct">
): number {
  if (!(basePrice > 0)) throw new Error("basePrice deve ser maior que zero");

  const commissionFactor = 1 - config.commissionPct / 100;
  if (commissionFactor <= 0) return Infinity;

  const requiredListingPrice = (basePrice + config.fixedFeeBRL + config.shippingCostBRL) / commissionFactor;
  return (requiredListingPrice / basePrice - 1) * 100;
}
