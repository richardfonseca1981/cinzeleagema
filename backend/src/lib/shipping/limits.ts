import type { ShippingCalculationItem } from "./types";

// Dimensões e peso mínimos de uma encomenda postal no Brasil (padrão
// Correios/transportadoras parceiras da Melhor Envio). O endpoint de
// cálculo da Melhor Envio não publica esses valores (conferido em
// docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos) — usados
// aqui como piso de segurança para não cotar uma caixa menor do que
// qualquer transportadora aceitaria. Ajustável se o cliente trocar de
// transportadora.
export const PACKAGE_MIN_LENGTH_CM = 16;
export const PACKAGE_MIN_WIDTH_CM = 11;
export const PACKAGE_MIN_HEIGHT_CM = 2;
export const PACKAGE_MIN_WEIGHT_G = 300;

// Limites máximos aceitos por qualquer serviço (maior lado, soma dos três
// lados, peso total da remessa). Mesma origem/ajustabilidade do bloco acima.
// Checado ANTES de chamar a Melhor Envio para economizar uma chamada à API
// quando já sabemos que nenhum serviço aceitaria o pacote.
export const PACKAGE_MAX_SIDE_CM = 105;
export const PACKAGE_MAX_SUM_OF_SIDES_CM = 200;
export const PACKAGE_MAX_TOTAL_WEIGHT_G = 30000;

export function exceedsCarrierLimits(items: ShippingCalculationItem[]): boolean {
  const totalWeightGrams = items.reduce((sum, item) => sum + item.package.weightGrams * item.quantity, 0);
  if (totalWeightGrams > PACKAGE_MAX_TOTAL_WEIGHT_G) return true;

  return items.some(({ package: pkg }) => {
    const maxSide = Math.max(pkg.lengthCm, pkg.widthCm, pkg.heightCm);
    const sumOfSides = pkg.lengthCm + pkg.widthCm + pkg.heightCm;
    return maxSide > PACKAGE_MAX_SIDE_CM || sumOfSides > PACKAGE_MAX_SUM_OF_SIDES_CM;
  });
}
