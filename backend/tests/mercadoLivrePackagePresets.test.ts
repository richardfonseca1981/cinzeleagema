import { describe, expect, it } from "vitest";
import {
  estimatePackageBox,
  getPackageOverrideCeilings,
  getPackagePresetsConfig,
  resolveManualPackageOverride,
  type PackageOverrideCeilings,
  type PackagePresetsConfig,
} from "../src/lib/mercadoLivre/packagePresets";

// Fase 1B etapa 10 — tetos de teste pro override manual, maiores que os
// presets automáticos (CONFIG abaixo) de propósito — mesmo raciocínio do
// default real em lib/env.ts.
const OVERRIDE_CEILINGS: PackageOverrideCeilings = { maxDimensionCm: 100, maxWeightG: 30000 };

// Mesmos valores padrão documentados em env.ts (ML_PACKAGE_*) — fixos aqui
// para o teste nunca depender do .env real.
const CONFIG: PackagePresetsConfig = {
  weightMarginG: 300,
  maxSizeCm: 60,
  maxWeightG: 15000,
  boxes: {
    P: { lengthCm: 20, widthCm: 16, heightCm: 12 },
    M: { lengthCm: 35, widthCm: 28, heightCm: 20 },
    G: { lengthCm: 50, widthCm: 40, heightCm: 30 },
    GG: { lengthCm: 65, widthCm: 50, heightCm: 40 },
  },
};

describe("estimatePackageBox", () => {
  it("peça mínima do catálogo (esfera 6g/1,6cm) cai no preset P", () => {
    const result = estimatePackageBox(6, 1.6, CONFIG);
    expect(result).toEqual({ ok: true, source: "preset", preset: "P", box: CONFIG.boxes.P, packageWeightGrams: 306 });
  });

  it("peça de porte médio por tamanho E peso cai no preset M", () => {
    const result = estimatePackageBox(3000, 25, CONFIG);
    expect(result.ok).toBe(true);
    expect(result.ok && result.preset).toBe("M");
  });

  it("usa o MAIOR preset exigido entre tamanho e peso — peça leve mas grande", () => {
    const result = estimatePackageBox(500, 40, CONFIG); // peso -> P, tamanho -> G
    expect(result.ok).toBe(true);
    expect(result.ok && result.preset).toBe("G");
  });

  it("usa o MAIOR preset exigido entre tamanho e peso — peça pesada mas pequena", () => {
    const result = estimatePackageBox(11000, 10, CONFIG); // peso -> G, tamanho -> P
    expect(result.ok).toBe(true);
    expect(result.ok && result.preset).toBe("G");
  });

  it("tamanho acima do teto de G mas dentro do teto de GG cai no preset GG", () => {
    const result = estimatePackageBox(2000, 55, CONFIG);
    expect(result.ok).toBe(true);
    expect(result.ok && result.preset).toBe("GG");
  });

  it("exatamente no teto do GG ainda é aceito (limite é <=, não <)", () => {
    const bySize = estimatePackageBox(2000, 60, CONFIG);
    expect(bySize).toEqual({ ok: true, source: "preset", preset: "GG", box: CONFIG.boxes.GG, packageWeightGrams: 2300 });

    const byWeight = estimatePackageBox(15000, 20, CONFIG);
    expect(byWeight.ok).toBe(true);
    expect(byWeight.ok && byWeight.preset).toBe("GG");
  });

  it("soma o peso de embalagem (weightMarginG) ao peso da peça, nunca multiplica/ignora", () => {
    const result = estimatePackageBox(1200, 10, CONFIG);
    expect(result.ok).toBe(true);
    expect(result.ok && result.packageWeightGrams).toBe(1200 + CONFIG.weightMarginG);
  });

  describe("casos extremos do catálogo — bloqueiam em vez de chutar caixa", () => {
    it("obelisco de 62cm (acima do teto de tamanho) bloqueia com size_exceeds_limit", () => {
      const result = estimatePackageBox(3000, 62, CONFIG);
      expect(result).toEqual({ ok: false, reason: "size_exceeds_limit" });
    });

    it("capela de 16,8kg (acima do teto de peso) bloqueia com weight_exceeds_limit", () => {
      const result = estimatePackageBox(16800, 20, CONFIG);
      expect(result).toEqual({ ok: false, reason: "weight_exceeds_limit" });
    });

    it("peça acima dos dois tetos ao mesmo tempo bloqueia com both_exceed_limit", () => {
      const result = estimatePackageBox(19000, 70, CONFIG);
      expect(result).toEqual({ ok: false, reason: "both_exceed_limit" });
    });
  });
});

// Fase 1B etapa 10 — override manual de embalagem.
describe("resolveManualPackageOverride", () => {
  it("override completo e válido: devolve a caixa manual", () => {
    const result = resolveManualPackageOverride({ lengthCm: 70, widthCm: 50, heightCm: 40, weightG: 17000 }, OVERRIDE_CEILINGS);
    expect(result).toEqual({ box: { lengthCm: 70, widthCm: 50, heightCm: 40 }, packageWeightGrams: 17000 });
  });

  it.each([
    ["sem nenhum campo", { lengthCm: null, widthCm: null, heightCm: null, weightG: null }],
    ["só 1 de 4 campos", { lengthCm: 70, widthCm: null, heightCm: null, weightG: null }],
    ["3 de 4 campos (falta o peso)", { lengthCm: 70, widthCm: 50, heightCm: 40, weightG: undefined }],
  ])("preenchimento parcial (%s) é tratado como ausente, nunca erro", (_label, input) => {
    expect(resolveManualPackageOverride(input, OVERRIDE_CEILINGS)).toBeNull();
  });

  it.each([
    ["zero", { lengthCm: 0, widthCm: 50, heightCm: 40, weightG: 17000 }],
    ["negativo", { lengthCm: -10, widthCm: 50, heightCm: 40, weightG: 17000 }],
    ["não numérico", { lengthCm: "abc", widthCm: 50, heightCm: 40, weightG: 17000 }],
  ])("valor inválido (%s) em qualquer campo invalida o override inteiro", (_label, input) => {
    expect(resolveManualPackageOverride(input, OVERRIDE_CEILINGS)).toBeNull();
  });

  it("acima do teto de dimensão configurável: invalida o override", () => {
    const result = resolveManualPackageOverride({ lengthCm: 150, widthCm: 50, heightCm: 40, weightG: 17000 }, OVERRIDE_CEILINGS);
    expect(result).toBeNull();
  });

  it("acima do teto de peso configurável: invalida o override", () => {
    const result = resolveManualPackageOverride({ lengthCm: 70, widthCm: 50, heightCm: 40, weightG: 35000 }, OVERRIDE_CEILINGS);
    expect(result).toBeNull();
  });

  it("exatamente no teto é aceito (limite é <=, não <)", () => {
    const result = resolveManualPackageOverride(
      { lengthCm: 100, widthCm: 100, heightCm: 100, weightG: 30000 },
      OVERRIDE_CEILINGS
    );
    expect(result).toEqual({ box: { lengthCm: 100, widthCm: 100, heightCm: 100 }, packageWeightGrams: 30000 });
  });
});

describe("estimatePackageBox com override manual", () => {
  it("obelisco de 62cm (bloqueado sem override) é liberado com override completo", () => {
    const blocked = estimatePackageBox(3000, 62, CONFIG);
    expect(blocked).toEqual({ ok: false, reason: "size_exceeds_limit" });

    const released = estimatePackageBox(
      3000,
      62,
      CONFIG,
      { lengthCm: 70, widthCm: 40, heightCm: 40, weightG: 3300 },
      OVERRIDE_CEILINGS
    );
    expect(released).toEqual({ ok: true, source: "manual", preset: null, box: { lengthCm: 70, widthCm: 40, heightCm: 40 }, packageWeightGrams: 3300 });
  });

  it("capela de 16,8kg (bloqueada sem override) é liberada com override completo", () => {
    const blocked = estimatePackageBox(16800, 20, CONFIG);
    expect(blocked).toEqual({ ok: false, reason: "weight_exceeds_limit" });

    const released = estimatePackageBox(
      16800,
      20,
      CONFIG,
      { lengthCm: 45, widthCm: 35, heightCm: 35, weightG: 17200 },
      OVERRIDE_CEILINGS
    );
    expect(released).toEqual({ ok: true, source: "manual", preset: null, box: { lengthCm: 45, widthCm: 35, heightCm: 35 }, packageWeightGrams: 17200 });
  });

  it("override tem PRECEDÊNCIA sobre o preset mesmo quando a peça já caberia num preset normal", () => {
    // 6g/1,6cm caberia tranquilamente no preset P (ver teste acima) — com um
    // override completo, usa a caixa manual de qualquer forma.
    const result = estimatePackageBox(6, 1.6, CONFIG, { lengthCm: 30, widthCm: 30, heightCm: 30, weightG: 500 }, OVERRIDE_CEILINGS);
    expect(result).toEqual({ ok: true, source: "manual", preset: null, box: { lengthCm: 30, widthCm: 30, heightCm: 30 }, packageWeightGrams: 500 });
  });

  it("override incompleto: ignorado, cai pro comportamento de preset normal", () => {
    const result = estimatePackageBox(6, 1.6, CONFIG, { lengthCm: 30, widthCm: null, heightCm: null, weightG: null }, OVERRIDE_CEILINGS);
    expect(result).toEqual({ ok: true, source: "preset", preset: "P", box: CONFIG.boxes.P, packageWeightGrams: 306 });
  });

  it("override com valor inválido: ignorado, cai pro comportamento de preset normal (nunca lança)", () => {
    const result = estimatePackageBox(6, 1.6, CONFIG, { lengthCm: -5, widthCm: 30, heightCm: 30, weightG: 500 }, OVERRIDE_CEILINGS);
    expect(result).toEqual({ ok: true, source: "preset", preset: "P", box: CONFIG.boxes.P, packageWeightGrams: 306 });
  });

  it("regressão: sem passar override/ceilings nenhum, o comportamento é IDÊNTICO ao de antes desta etapa", () => {
    expect(estimatePackageBox(6, 1.6, CONFIG)).toEqual({ ok: true, source: "preset", preset: "P", box: CONFIG.boxes.P, packageWeightGrams: 306 });
    expect(estimatePackageBox(3000, 62, CONFIG)).toEqual({ ok: false, reason: "size_exceeds_limit" });
    expect(estimatePackageBox(16800, 20, CONFIG)).toEqual({ ok: false, reason: "weight_exceeds_limit" });
  });
});

describe("getPackageOverrideCeilings", () => {
  it("mapeia as duas variáveis de env pro campo correto", () => {
    expect(getPackageOverrideCeilings({ ML_PACKAGE_OVERRIDE_MAX_DIMENSION_CM: 123, ML_PACKAGE_OVERRIDE_MAX_WEIGHT_G: 456 })).toEqual({
      maxDimensionCm: 123,
      maxWeightG: 456,
    });
  });
});

describe("getPackagePresetsConfig", () => {
  it("mapeia cada variável de env pro campo correto da config, sem trocar nenhuma", () => {
    const config = getPackagePresetsConfig({
      ML_PACKAGE_WEIGHT_MARGIN_G: 111,
      ML_PACKAGE_MAX_SIZE_CM: 222,
      ML_PACKAGE_MAX_WEIGHT_G: 333,
      ML_PACKAGE_BOX_P_LENGTH_CM: 1,
      ML_PACKAGE_BOX_P_WIDTH_CM: 2,
      ML_PACKAGE_BOX_P_HEIGHT_CM: 3,
      ML_PACKAGE_BOX_M_LENGTH_CM: 4,
      ML_PACKAGE_BOX_M_WIDTH_CM: 5,
      ML_PACKAGE_BOX_M_HEIGHT_CM: 6,
      ML_PACKAGE_BOX_G_LENGTH_CM: 7,
      ML_PACKAGE_BOX_G_WIDTH_CM: 8,
      ML_PACKAGE_BOX_G_HEIGHT_CM: 9,
      ML_PACKAGE_BOX_GG_LENGTH_CM: 10,
      ML_PACKAGE_BOX_GG_WIDTH_CM: 11,
      ML_PACKAGE_BOX_GG_HEIGHT_CM: 12,
    });

    expect(config).toEqual({
      weightMarginG: 111,
      maxSizeCm: 222,
      maxWeightG: 333,
      boxes: {
        P: { lengthCm: 1, widthCm: 2, heightCm: 3 },
        M: { lengthCm: 4, widthCm: 5, heightCm: 6 },
        G: { lengthCm: 7, widthCm: 8, heightCm: 9 },
        GG: { lengthCm: 10, widthCm: 11, heightCm: 12 },
      },
    });
  });
});
