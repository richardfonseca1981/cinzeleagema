import type { ShippingShipment } from "./types";

// Peso mínimo de uma encomenda postal no Brasil (padrão Correios/
// transportadoras parceiras da Melhor Envio), usado como piso de segurança.
export const PACKAGE_MIN_WEIGHT_G = 300;

// Limites máximos aceitos por qualquer serviço (maior lado, soma dos três
// lados, peso total da remessa). Mesma origem/ajustabilidade do bloco acima.
// Checado ANTES de chamar a Melhor Envio para economizar uma chamada à API
// quando já sabemos que nenhum serviço aceitaria o pacote.
export const PACKAGE_MAX_SIDE_CM = 105;
export const PACKAGE_MAX_SUM_OF_SIDES_CM = 200;
export const PACKAGE_MAX_TOTAL_WEIGHT_G = 30000;

export function exceedsCarrierLimits(shipment: ShippingShipment): boolean {
  if (shipment.weightGrams > PACKAGE_MAX_TOTAL_WEIGHT_G) return true;

  const { lengthCm, widthCm, heightCm } = shipment.box;
  const maxSide = Math.max(lengthCm, widthCm, heightCm);
  return maxSide > PACKAGE_MAX_SIDE_CM || lengthCm + widthCm + heightCm > PACKAGE_MAX_SUM_OF_SIDES_CM;
}
