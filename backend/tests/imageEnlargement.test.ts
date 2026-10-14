import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { applyOperations, type Operation } from "../src/lib/imageOperations";

// Regressão: resize/crop não podem AMPLIAR fotos pequenas (borra e pixela no
// site). Aqui só rodam Sharp e a função de execução, sem rede nem banco.

async function photo(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 160 } } })
    .jpeg()
    .toBuffer();
}

async function sizeAfter(input: Buffer, ops: Operation[]): Promise<{ width?: number; height?: number }> {
  const { buffer } = await applyOperations(input, ops);
  const meta = await sharp(buffer).metadata();
  return { width: meta.width, height: meta.height };
}

describe("resize nunca amplia", () => {
  it("largura maior que a da foto: mantém o tamanho original", async () => {
    expect(await sizeAfter(await photo(300, 200), [{ operation: "resize", width: 1200 }])).toEqual({ width: 300, height: 200 });
  });

  it("altura maior que a da foto: mantém o tamanho original", async () => {
    expect(await sizeAfter(await photo(300, 200), [{ operation: "resize", height: 1000 }])).toEqual({ width: 300, height: 200 });
  });

  it("largura e altura maiores: mantém o tamanho original", async () => {
    expect(await sizeAfter(await photo(300, 200), [{ operation: "resize", width: 1200, height: 1200 }])).toEqual({ width: 300, height: 200 });
  });

  it("continua REDUZINDO fotos grandes normalmente", async () => {
    expect(await sizeAfter(await photo(2000, 1000), [{ operation: "resize", width: 800 }])).toEqual({ width: 800, height: 400 });
  });
});

describe("crop nunca amplia", () => {
  it("largura e altura maiores que a foto: reduz o corte para caber, na proporção pedida", async () => {
    expect(await sizeAfter(await photo(300, 200), [{ operation: "crop", width: 800, height: 800 }])).toEqual({ width: 200, height: 200 });
  });

  it("proporção 1:1 continua cortando sem ampliar", async () => {
    expect(await sizeAfter(await photo(300, 200), [{ operation: "crop", aspectRatio: "1:1" }])).toEqual({ width: 200, height: 200 });
  });

  it("corte menor que a foto continua com o tamanho pedido", async () => {
    expect(await sizeAfter(await photo(1000, 800), [{ operation: "crop", width: 400, height: 300 }])).toEqual({ width: 400, height: 300 });
  });
});
