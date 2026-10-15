import { PACKAGE_MIN_WEIGHT_G } from "./limits";
import type { ShippingBox, ShippingShipment, ShippingUnavailableReason } from "./types";

// Decisão do cliente: NÃO há cadastro de tamanho de caixa. Todo pedido é
// cotado como UMA única caixa fixa de 40 x 30 x 25 cm (comprimento x largura
// x altura) com 300 g de embalagem vazia. Os valores podem ser sobrescritos
// por SHIPPING_BOX_* / SHIPPING_PACKAGING_WEIGHT_G (lib/env.ts).
export const DEFAULT_BOX_LENGTH_CM = 40;
export const DEFAULT_BOX_WIDTH_CM = 30;
export const DEFAULT_BOX_HEIGHT_CM = 25;
export const DEFAULT_PACKAGING_WEIGHT_G = 300;

// Fração do volume da caixa que as peças podem ocupar (o resto é
// enchimento/proteção). Premissa conservadora.
export const BOX_FILL_FACTOR = 0.6;

export interface ShipmentConfig {
  box: ShippingBox;
  packagingWeightG: number;
}

export interface ShipmentItem {
  weightGrams: number;
  sizeCm: number;
  quantity: number;
  unitPriceBRL: number;
}

export type ComputeShipmentResult =
  | { ok: true; shipment: ShippingShipment }
  | { ok: false; reason: Extract<ShippingUnavailableReason, "incomplete_product_data" | "over_limits"> };

export function getShipmentConfig(source: {
  SHIPPING_BOX_LENGTH_CM: number;
  SHIPPING_BOX_WIDTH_CM: number;
  SHIPPING_BOX_HEIGHT_CM: number;
  SHIPPING_PACKAGING_WEIGHT_G: number;
}): ShipmentConfig {
  return {
    box: {
      lengthCm: source.SHIPPING_BOX_LENGTH_CM,
      widthCm: source.SHIPPING_BOX_WIDTH_CM,
      heightCm: source.SHIPPING_BOX_HEIGHT_CM,
    },
    packagingWeightG: source.SHIPPING_PACKAGING_WEIGHT_G,
  };
}

// Função pura: itens do pedido -> um único volume (caixa fixa).
// Premissas conservadoras (nunca dividimos o pedido em várias caixas):
//  - tamanho: uma peça com sizeCm maior que o MENOR lado da caixa (25 cm) não
//    cabe -> over_limits (frete combinado pelo atendimento);
//  - volume: cada peça é tratada como um cubo de sizeCm de lado; a soma de
//    sizeCm³ x quantidade não pode passar de BOX_FILL_FACTOR x volume da
//    caixa (exatamente no limite ainda passa);
//  - peso: soma de peso x quantidade + embalagem UMA vez; o limite de peso da
//    transportadora é checado pelo provedor (limits.ts);
//  - seguro: soma de preço x quantidade.
// Reutilizável pela futura tabela internacional (Parte 1B).
export function computeShipment(items: ShipmentItem[], config: ShipmentConfig): ComputeShipmentResult {
  if (items.some((item) => !(item.weightGrams > 0) || !(item.sizeCm > 0))) {
    return { ok: false, reason: "incomplete_product_data" };
  }

  const { box } = config;
  const maxItemSizeCm = Math.min(box.lengthCm, box.widthCm, box.heightCm);
  if (items.some((item) => item.sizeCm > maxItemSizeCm)) {
    return { ok: false, reason: "over_limits" };
  }

  const itemsVolumeCm3 = items.reduce((sum, item) => sum + item.sizeCm ** 3 * item.quantity, 0);
  const boxVolumeCm3 = box.lengthCm * box.widthCm * box.heightCm;
  if (itemsVolumeCm3 > boxVolumeCm3 * BOX_FILL_FACTOR + 1e-9) {
    return { ok: false, reason: "over_limits" };
  }

  const itemsWeightG = items.reduce((sum, item) => sum + item.weightGrams * item.quantity, 0);
  const insuranceValueBRL = items.reduce((sum, item) => sum + item.unitPriceBRL * item.quantity, 0);

  return {
    ok: true,
    shipment: {
      box: { ...box },
      weightGrams: Math.max(itemsWeightG + config.packagingWeightG, PACKAGE_MIN_WEIGHT_G),
      insuranceValueBRL: Math.round(insuranceValueBRL * 100) / 100,
    },
  };
}
