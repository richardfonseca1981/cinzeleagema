import { describe, expect, it } from "vitest";
import "./setup";
import { estimatePackage } from "../src/lib/shipping/packageEstimator";
import {
  PACKAGE_MIN_HEIGHT_CM,
  PACKAGE_MIN_LENGTH_CM,
  PACKAGE_MIN_WEIGHT_G,
  PACKAGE_MIN_WIDTH_CM,
} from "../src/lib/shipping/limits";

const config = { paddingCm: 3, packagingWeightG: 200 };

describe("estimatePackage", () => {
  it("usa as dimensões de embalagem informadas no produto quando as 3 estão preenchidas", () => {
    const result = estimatePackage(
      {
        weightGrams: 50,
        sizeCm: 2,
        packageLengthCm: 20,
        packageWidthCm: 15,
        packageHeightCm: 10,
      },
      config
    );

    expect(result).toEqual({
      ok: true,
      // peso 50g + embalagem 200g = 250g, abaixo do mínimo de 300g -> clampado
      package: { lengthCm: 20, widthCm: 15, heightCm: 10, weightGrams: 300 },
    });
  });

  it("estima uma caixa cúbica (sizeCm + 2x padding) quando as dimensões de embalagem não foram informadas", () => {
    const result = estimatePackage(
      { weightGrams: 50, sizeCm: 10, packageLengthCm: null, packageWidthCm: null, packageHeightCm: null },
      config
    );

    expect(result).toEqual({
      ok: true,
      // 10 + 2*3 = 16 em cada lado; peso 50g + 200g = 250g, clampado a 300g
      package: { lengthCm: 16, widthCm: 16, heightCm: 16, weightGrams: 300 },
    });
  });

  it("estima cúbica também quando só uma das 3 dimensões de embalagem foi informada (não usa parcial)", () => {
    const result = estimatePackage(
      { weightGrams: 50, sizeCm: 10, packageLengthCm: 30, packageWidthCm: null, packageHeightCm: null },
      config
    );

    expect(result).toEqual({
      ok: true,
      package: { lengthCm: 16, widthCm: 16, heightCm: 16, weightGrams: 300 },
    });
  });

  it("aplica os mínimos de dimensão/peso quando o cálculo fica abaixo deles", () => {
    const result = estimatePackage(
      { weightGrams: 5, sizeCm: 0.5, packageLengthCm: null, packageWidthCm: null, packageHeightCm: null },
      { paddingCm: 0, packagingWeightG: 10 }
    );

    expect(result).toEqual({
      ok: true,
      package: {
        lengthCm: PACKAGE_MIN_LENGTH_CM,
        widthCm: PACKAGE_MIN_WIDTH_CM,
        heightCm: PACKAGE_MIN_HEIGHT_CM,
        weightGrams: PACKAGE_MIN_WEIGHT_G,
      },
    });
  });

  it("não aplica mínimo quando a dimensão manual informada já é maior (mínimo é só piso, não substitui valor real)", () => {
    const result = estimatePackage(
      { weightGrams: 5000, sizeCm: 10, packageLengthCm: 300, packageWidthCm: 300, packageHeightCm: 300 },
      config
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.package.lengthCm).toBe(300);
    }
  });

  it("trata peso zerado (cadastro incompleto) como não cotável", () => {
    const result = estimatePackage(
      { weightGrams: 0, sizeCm: 10, packageLengthCm: null, packageWidthCm: null, packageHeightCm: null },
      config
    );

    expect(result).toEqual({ ok: false, reason: "incomplete_product_data" });
  });

  it("trata tamanho zerado (cadastro incompleto) como não cotável", () => {
    const result = estimatePackage(
      { weightGrams: 50, sizeCm: 0, packageLengthCm: null, packageWidthCm: null, packageHeightCm: null },
      config
    );

    expect(result).toEqual({ ok: false, reason: "incomplete_product_data" });
  });
});
