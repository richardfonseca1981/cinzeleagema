import {
  PACKAGE_MIN_HEIGHT_CM,
  PACKAGE_MIN_LENGTH_CM,
  PACKAGE_MIN_WEIGHT_G,
  PACKAGE_MIN_WIDTH_CM,
} from "./limits";
import type { EstimatedPackage } from "./types";

export interface PackageEstimatorProductInput {
  weightGrams: number;
  sizeCm: number;
  packageLengthCm: number | null;
  packageWidthCm: number | null;
  packageHeightCm: number | null;
}

export interface PackageEstimatorConfig {
  paddingCm: number;
  packagingWeightG: number;
}

export type PackageEstimateResult =
  | { ok: true; package: EstimatedPackage }
  | { ok: false; reason: "incomplete_product_data" };

// Função pura: dado um produto e a config de embalagem (SHIPPING_PADDING_CM
// / SHIPPING_PACKAGING_WEIGHT_G), calcula as dimensões e o peso da caixa a
// enviar ao provedor de frete. Produto com peso ou tamanho zerados (cadastro
// legado/incompleto) não pode ser cotado.
export function estimatePackage(
  product: PackageEstimatorProductInput,
  config: PackageEstimatorConfig
): PackageEstimateResult {
  if (!(product.weightGrams > 0) || !(product.sizeCm > 0)) {
    return { ok: false, reason: "incomplete_product_data" };
  }

  const hasManualDimensions =
    product.packageLengthCm !== null &&
    product.packageWidthCm !== null &&
    product.packageHeightCm !== null &&
    product.packageLengthCm > 0 &&
    product.packageWidthCm > 0 &&
    product.packageHeightCm > 0;

  const estimatedSide = product.sizeCm + 2 * config.paddingCm;

  const rawLength = hasManualDimensions ? product.packageLengthCm! : estimatedSide;
  const rawWidth = hasManualDimensions ? product.packageWidthCm! : estimatedSide;
  const rawHeight = hasManualDimensions ? product.packageHeightCm! : estimatedSide;
  const rawWeight = product.weightGrams + config.packagingWeightG;

  return {
    ok: true,
    package: {
      lengthCm: Math.max(rawLength, PACKAGE_MIN_LENGTH_CM),
      widthCm: Math.max(rawWidth, PACKAGE_MIN_WIDTH_CM),
      heightCm: Math.max(rawHeight, PACKAGE_MIN_HEIGHT_CM),
      weightGrams: Math.max(rawWeight, PACKAGE_MIN_WEIGHT_G),
    },
  };
}
