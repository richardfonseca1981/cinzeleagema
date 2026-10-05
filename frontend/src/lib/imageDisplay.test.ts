import { describe, expect, it } from "vitest";
import { computeDisplaySize, MAX_UPSCALE } from "./imageDisplay";

const FRAME_4_3 = { width: 400, height: 300 };

describe("computeDisplaySize", () => {
  it("imagem minúscula (120×120): amplia no máximo 1,5x e fica menor que a moldura", () => {
    const r = computeDisplaySize({ width: 120, height: 120 }, FRAME_4_3);
    expect(r.scale).toBe(MAX_UPSCALE);
    expect(r).toMatchObject({ width: 180, height: 180 });
  });

  it("imagem pequena (400×300) numa moldura do mesmo tamanho: exibe em 1x", () => {
    expect(computeDisplaySize({ width: 400, height: 300 }, FRAME_4_3)).toMatchObject({ width: 400, height: 300, scale: 1 });
  });

  it("imagem pequena numa moldura bem maior: para em 1,5x (não preenche a moldura)", () => {
    const r = computeDisplaySize({ width: 400, height: 300 }, { width: 800, height: 600 });
    expect(r).toMatchObject({ width: 600, height: 450, scale: 1.5 });
  });

  it("retrato (300×600): cabe pela altura, inteira e sem cortar", () => {
    expect(computeDisplaySize({ width: 300, height: 600 }, FRAME_4_3)).toMatchObject({ width: 150, height: 300, scale: 0.5 });
  });

  it("panorâmica (1200×300): cabe pela largura, inteira e sem cortar", () => {
    const r = computeDisplaySize({ width: 1200, height: 300 }, FRAME_4_3);
    expect(r.width).toBe(400);
    expect(r.height).toBe(100);
  });

  it("imagem normal (800×600): reduz para caber na moldura", () => {
    expect(computeDisplaySize({ width: 800, height: 600 }, FRAME_4_3)).toMatchObject({ width: 400, height: 300, scale: 0.5 });
  });

  it("imagem grande (1600×1200): reduz, nunca passa da moldura", () => {
    const r = computeDisplaySize({ width: 1600, height: 1200 }, FRAME_4_3);
    expect(r).toMatchObject({ width: 400, height: 300 });
  });

  it("nunca excede a moldura nem distorce a proporção, para qualquer formato", () => {
    for (const [w, h] of [[50, 50], [120, 120], [300, 600], [1200, 300], [999, 1000], [4000, 3000]]) {
      const r = computeDisplaySize({ width: w, height: h }, { width: 360, height: 360 });
      expect(r.width).toBeLessThanOrEqual(360);
      expect(r.height).toBeLessThanOrEqual(360);
      expect(r.scale).toBeLessThanOrEqual(MAX_UPSCALE);
      expect(Math.abs(r.width / r.height - w / h)).toBeLessThan(0.03 + 1 / Math.min(r.width, r.height));
    }
  });

  it("respeita um limite de ampliação customizado", () => {
    expect(computeDisplaySize({ width: 100, height: 100 }, FRAME_4_3, 1).width).toBe(100);
  });

  it("dimensões inválidas (ainda não carregou): devolve o tamanho da moldura sem quebrar", () => {
    expect(computeDisplaySize({ width: 0, height: 0 }, FRAME_4_3)).toEqual({ width: 400, height: 300, scale: 1 });
  });
});
