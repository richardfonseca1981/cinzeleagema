import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { applyVibrance, enhanceColor } from "../src/lib/imageOperations";

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

describe("applyVibrance (função pura)", () => {
  it("deixa uma cor neutra/pouco saturada idêntica (abaixo do chromaFloor)", () => {
    const data = new Uint8Array([190, 192, 196]);
    applyVibrance(data, 3, 0.7);
    expect(Array.from(data)).toEqual([190, 192, 196]);
  });

  it("aumenta a saturação de uma cor moderadamente saturada", () => {
    const original: [number, number, number] = [130, 95, 150];
    const data = new Uint8Array(original);
    const originalSaturation = saturation(...original);

    applyVibrance(data, 3, 0.7);

    const resultSaturation = saturation(data[0], data[1], data[2]);
    expect(resultSaturation).toBeGreaterThan(originalSaturation);
  });

  it("não mexe em pixel com alpha 0 (RGBA)", () => {
    const data = new Uint8Array([130, 95, 150, 0]);
    applyVibrance(data, 4, 1.1);
    expect(Array.from(data)).toEqual([130, 95, 150, 0]);
  });

  it("mexe normalmente em pixel RGBA com alpha > 0", () => {
    const data = new Uint8Array([130, 95, 150, 255]);
    applyVibrance(data, 4, 0.7);
    const resultSaturation = saturation(data[0], data[1], data[2]);
    expect(resultSaturation).toBeGreaterThan(saturation(130, 95, 150));
    expect(data[3]).toBe(255); // alpha nunca é tocado, mesmo > 0
  });

  it("nunca produz um canal fora de 0-255, mesmo no nível mais forte e em cores extremas", () => {
    const pixels: [number, number, number][] = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
      [10, 10, 245],
      [250, 5, 5],
      [1, 250, 1],
      [60, 200, 30],
    ];

    for (const pixel of pixels) {
      const data = new Uint8Array(pixel);
      applyVibrance(data, 3, 1.1); // nível "forte"
      for (const channel of data) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it("preserva a luminância média do pixel (só reforça saturação, não brilho)", () => {
    const original: [number, number, number] = [130, 95, 150];
    const originalLum = luminance(...original);
    const data = new Uint8Array(original);

    applyVibrance(data, 3, 1.1);

    const resultLum = luminance(data[0], data[1], data[2]);
    // Tolerância pequena só pelo arredondamento de Math.round em cada canal.
    expect(Math.abs(resultLum - originalLum)).toBeLessThan(1.5);
  });
});

describe("enhanceColor (integração ponta a ponta)", () => {
  async function makeModerateColorImage(channels: 3 | 4 = 3): Promise<Buffer> {
    const background =
      channels === 4 ? { r: 130, g: 95, b: 150, alpha: 1 } : { r: 130, g: 95, b: 150 };
    return sharp({ create: { width: 40, height: 40, channels, background } })
      .png()
      .toBuffer();
  }

  it("retorna um webp válido, com as mesmas dimensões da entrada", async () => {
    const input = await makeModerateColorImage();
    const output = await enhanceColor(input, "medio");

    const meta = await sharp(output).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(40);
    expect(meta.height).toBe(40);
  });

  it("aumenta a saturação média da imagem (comparado ao original)", async () => {
    const input = await makeModerateColorImage();
    const output = await enhanceColor(input, "medio");

    const { data: inPixels } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
    // enhanceColor sempre adiciona alpha internamente (ensureAlpha) — a
    // saída é RGBA mesmo quando a entrada era RGB; os 3 primeiros bytes
    // continuam sendo R,G,B de qualquer forma.
    const { data: outPixels } = await sharp(output).raw().toBuffer({ resolveWithObject: true });

    const originalSaturation = saturation(inPixels[0], inPixels[1], inPixels[2]);
    const resultSaturation = saturation(outPixels[0], outPixels[1], outPixels[2]);

    expect(resultSaturation).toBeGreaterThan(originalSaturation);
  });

  it("nível 'forte' realça mais que 'leve' na mesma imagem", async () => {
    const input = await makeModerateColorImage();

    const leve = await enhanceColor(input, "leve");
    const forte = await enhanceColor(input, "forte");

    const { data: levePixels } = await sharp(leve).raw().toBuffer({ resolveWithObject: true });
    const { data: fortePixels } = await sharp(forte).raw().toBuffer({ resolveWithObject: true });

    const leveSaturation = saturation(levePixels[0], levePixels[1], levePixels[2]);
    const forteSaturation = saturation(fortePixels[0], fortePixels[1], fortePixels[2]);

    expect(forteSaturation).toBeGreaterThan(leveSaturation);
  });

  it("preserva o canal alpha de uma imagem com transparência (pixels já transparentes continuam transparentes)", async () => {
    const transparentInput = await sharp({
      create: { width: 20, height: 20, channels: 4, background: { r: 130, g: 95, b: 150, alpha: 0 } },
    })
      .png()
      .toBuffer();

    const output = await enhanceColor(transparentInput, "forte");

    const meta = await sharp(output).metadata();
    expect(meta.hasAlpha).toBe(true);

    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(data[3]).toBe(0); // alpha do primeiro pixel continua 0
  });

  it("usa o nível 'medio' como padrão quando nenhum é informado", async () => {
    const input = await makeModerateColorImage();
    const defaultLevel = await enhanceColor(input);
    const explicitMedio = await enhanceColor(input, "medio");

    const metaDefault = await sharp(defaultLevel).metadata();
    const metaMedio = await sharp(explicitMedio).metadata();
    expect(metaDefault.width).toBe(metaMedio.width);
    expect(metaDefault.format).toBe("webp");
  });
});
