import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processCatalogPhoto } from "../src/lib/catalog/photoLayer";

async function samplePixel(buffer: Buffer, x: number, y: number): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
}

function closeTo(value: number, target: number, tolerance = 20): boolean {
  return Math.abs(value - target) <= tolerance;
}

describe("processCatalogPhoto", () => {
  it("'contain' produz uma imagem com as dimensões exatas da área de foto pedida", async () => {
    const raw = await sharp({ create: { width: 300, height: 500, channels: 3, background: { r: 200, g: 50, b: 50 } } })
      .jpeg()
      .toBuffer();

    const { composite } = await processCatalogPhoto(raw, { quality: "light", photoAreaHeight: 500, photoFit: "contain" });
    const metadata = await sharp(composite).metadata();

    // canvasWidth do preset "light" é 900px; canvasHeight = round(900 * (500/595.28)).
    expect(metadata.width).toBe(900);
    expect(metadata.height).toBe(Math.round(900 * (500 / 595.28)));
  });

  it("'cover' produz uma imagem com as dimensões exatas da área de foto, sem sobra", async () => {
    const raw = await sharp({ create: { width: 300, height: 500, channels: 3, background: { r: 50, g: 200, b: 50 } } })
      .jpeg()
      .toBuffer();

    const { composite } = await processCatalogPhoto(raw, { quality: "light", photoAreaHeight: 500, photoFit: "cover" });
    const metadata = await sharp(composite).metadata();

    expect(metadata.width).toBe(900);
    expect(metadata.height).toBe(Math.round(900 * (500 / 595.28)));
  });

  it("'contain' encosta exatamente na borda do eixo dominante (sem fresta de fundo) — REGRESSÃO", async () => {
    // BUG CORRIGIDO (revisão final item 3): `fit:"inside"` + reler
    // info.width/height do próprio sharp deixava 1-2px de fresta no eixo
    // dominante em alguns casos reais (ver SKU 32 no relatório) — a foto
    // encostava quase, mas não exatamente, na borda do canvas, e o fundo
    // desfocado/escurecido aparecia como uma linha fina ali. Imagem bem
    // mais alta que larga (600x1200, maior que o canvas para não acionar o
    // piso de "nunca ampliar") num canvas relativamente LARGO (900x454)
    // força o eixo ALTURA a ser o dominante — a foto deve preencher a
    // altura do canvas por completo, sem nenhuma linha de fundo visível no
    // topo/base.
    const photoColor = { r: 10, g: 200, b: 10 };
    const raw = await sharp({ create: { width: 600, height: 1200, channels: 3, background: photoColor } }).jpeg({ quality: 100 }).toBuffer();

    const { composite } = await processCatalogPhoto(raw, { quality: "light", photoAreaHeight: 300, photoFit: "contain" });
    const metadata = await sharp(composite).metadata();
    const canvasWidth = metadata.width!;
    const canvasHeight = metadata.height!;

    const topRow = await samplePixel(composite, Math.round(canvasWidth / 2), 0);
    const bottomRow = await samplePixel(composite, Math.round(canvasWidth / 2), canvasHeight - 1);

    // Fundo (ver BACKGROUND_TINT) é escuro/azulado — bem diferente do verde
    // vivo da "foto". Se houvesse fresta, a borda leria a cor do fundo, não
    // a da foto.
    expect(closeTo(topRow.g, photoColor.g, 25)).toBe(true);
    expect(closeTo(bottomRow.g, photoColor.g, 25)).toBe(true);
    expect(topRow.g).toBeGreaterThan(topRow.b + 50);
    expect(bottomRow.g).toBeGreaterThan(bottomRow.b + 50);
  });

  it("'cover' ancora o corte verticalmente em ~40% do excedente a partir do topo", async () => {
    // Imagem bem mais alta que larga (1000x200 em pé, ou seja width=200,
    // height=1000) com uma linha divisória de cor nos 40% do topo — se o
    // corte estiver ancorado corretamente, o pixel logo ANTES da linha
    // divisória (dentro do recorte) deve ser da cor de cima, e o pixel bem
    // depois deve ser da cor de baixo.
    const width = 200;
    const height = 1000;
    const splitAt = Math.round(height * 0.4); // 400
    const top = await sharp({ create: { width, height: splitAt, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
    const bottom = await sharp({ create: { width, height: height - splitAt, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .png()
      .toBuffer();
    const raw = await sharp({ create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite([
        { input: top, left: 0, top: 0 },
        { input: bottom, left: 0, top: splitAt },
      ])
      .png()
      .toBuffer();

    // canvasWidth=200 (preset "light" força 900, então usamos quality
    // "standard" com um canvasWidth forçado via photoAreaHeight tal que o
    // canvas final seja 200x200 não é possível diretamente — em vez disso,
    // conferimos a posição relativa do corte via metadata + amostra de
    // pixel, usando o canvasWidth real do preset.
    const { composite } = await processCatalogPhoto(raw, { quality: "light", photoAreaHeight: 595.28, photoFit: "cover" });
    const metadata = await sharp(composite).metadata();
    expect(metadata.width).toBe(900);
    expect(metadata.height).toBe(900); // photoAreaHeight = PAGE_WIDTH -> canvas quadrado

    // scale = max(900/200, 900/1000) = 4.5; resizedHeight = 4500;
    // maxTop = 4500-900 = 3600; top = round(3600*0.4) = 1440.
    // splitAt (400) escalado por 4.5 = 1800 -> dentro do resized, a linha
    // divisória fica em y=1800; no canvas final (top=1440), a linha cai em
    // y = 1800-1440 = 360 (dentro dos 900px de altura do canvas).
    const splitInOutput = 1800 - 1440;
    const aboveSplit = await samplePixel(composite, 450, splitInOutput - 30);
    const belowSplit = await samplePixel(composite, 450, splitInOutput + 30);

    expect(closeTo(aboveSplit.r, 255) && closeTo(aboveSplit.b, 0)).toBe(true);
    expect(closeTo(belowSplit.b, 255) && closeTo(belowSplit.r, 0)).toBe(true);
  });
});
