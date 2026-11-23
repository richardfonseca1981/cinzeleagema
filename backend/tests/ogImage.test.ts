import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, renderProductOgImage } from "../src/lib/seo/ogImage";

async function makePortraitPhoto(width: number, height: number, hasAlpha = false): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: hasAlpha ? 4 : 3, background: { r: 120, g: 60, b: 180, alpha: hasAlpha ? 0.5 : 1 } },
  })
    .webp()
    .toBuffer();
}

describe("renderProductOgImage", () => {
  it("devolve JPEG 1200x630 sem canal alfa a partir de uma foto 9:16", async () => {
    const source = await makePortraitPhoto(1080, 1920);
    const out = await renderProductOgImage(source);
    const meta = await sharp(out).metadata();

    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(OG_IMAGE_WIDTH);
    expect(meta.height).toBe(OG_IMAGE_HEIGHT);
    expect(meta.hasAlpha).toBe(false);
  });

  it("achata transparência (foto com remoção de fundo) em vez de vazar alfa pro JPEG", async () => {
    const source = await makePortraitPhoto(1080, 1920, true);
    const out = await renderProductOgImage(source);
    const meta = await sharp(out).metadata();
    expect(meta.hasAlpha).toBe(false);
  });

  it("nunca amplia: foto menor que o canvas não é esticada além do tamanho original", async () => {
    const source = await makePortraitPhoto(300, 533);
    const out = await renderProductOgImage(source);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(OG_IMAGE_WIDTH);
    expect(meta.height).toBe(OG_IMAGE_HEIGHT);
  });

  it("imagem sem dimensões válidas rejeita com erro claro", async () => {
    await expect(renderProductOgImage(Buffer.from("não é uma imagem"))).rejects.toThrow();
  });
});
