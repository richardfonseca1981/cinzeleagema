import { describe, expect, it } from "vitest";
import { estimatePackageBox, getPackagePresetsConfig, type PackagePresetsConfig } from "../src/lib/mercadoLivre/packagePresets";

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
    expect(result).toEqual({ ok: true, preset: "P", box: CONFIG.boxes.P, packageWeightGrams: 306 });
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
    expect(bySize).toEqual({ ok: true, preset: "GG", box: CONFIG.boxes.GG, packageWeightGrams: 2300 });

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
