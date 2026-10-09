import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import "./setup";

// Mocka só a Claude API e o R2 — Sharp, zod, multer e as rotas rodam de
// verdade, para provar (sem olho humano) que o realce chega nos pixels.
vi.mock("../src/lib/claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/claude")>();
  return { ...actual, interpretPhotoInstruction: vi.fn() };
});
vi.mock("../src/lib/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/r2")>();
  return {
    ...actual,
    isR2Configured: vi.fn(() => true),
    getObject: vi.fn(),
    putObject: vi.fn(),
    deleteObject: vi.fn(),
  };
});

import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { interpretPhotoInstruction } from "../src/lib/claude";
import * as r2 from "../src/lib/r2";
import { cleanDatabase, generateTestToken } from "./helpers";

const mockedInterpret = vi.mocked(interpretPhotoInstruction);
const mockedGetObject = vi.mocked(r2.getObject);
const mockedPutObject = vi.mocked(r2.putObject);

const app = createApp();
const token = generateTestToken();

// Foto sintética "de pedra": faixas azul/verde/roxa/turquesa de saturação
// média (~0,3) sobre um fundo claro quase neutro, com gradiente de brilho.
async function makeStoneLikeImage(): Promise<Buffer> {
  const width = 120;
  const height = 214; // 9:16: sem o canvas de fundo desfocado, a saturação medida é só da peça
  const raw = Buffer.alloc(width * height * 3);
  const bands: [number, number, number][] = [
    [90, 110, 150],
    [100, 140, 115],
    [140, 120, 170],
    [120, 150, 160],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const inStone = y > 15 && y < height - 15;
      const base: [number, number, number] = inStone ? bands[Math.floor(x / 30)] : [235, 236, 238];
      const v = inStone ? 0.8 + 0.4 * (y / height) : 1;
      raw[i] = Math.min(255, base[0] * v);
      raw[i + 1] = Math.min(255, base[1] * v);
      raw[i + 2] = Math.min(255, base[2] * v);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

// Saturação HSV média (ignora pixels transparentes) e % de pixels com algum
// canal estourado (0 ou 255) — mede o resultado direto nos pixels.
async function colorStats(buffer: Buffer): Promise<{ meanSaturation: number; clippedPct: number }> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let count = 0;
  let clipped = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] === 0) continue;
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    if (max === 0) continue;
    sum += (max - min) / max;
    count++;
    if (max === 255 || min === 0) clipped++;
  }
  return { meanSaturation: sum / count, clippedPct: (100 * clipped) / count };
}

function bufferFromDataUrl(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

let original: Buffer;
let productId: string;
let imageId: string;

beforeEach(async () => {
  await cleanDatabase();
  mockedInterpret.mockReset();
  mockedGetObject.mockReset();
  mockedPutObject.mockReset();

  original = await makeStoneLikeImage();

  const category = await prisma.category.create({ data: { name: "Homedecor", slug: "homedecor" } });
  const product = await prisma.product.create({
    data: { name: "Peça de teste", slug: `peca-teste-${Date.now()}`, price: 100, categoryId: category.id },
  });
  productId = product.id;
  const image = await prisma.productImage.create({
    data: { productId, url: "https://example.com/original.jpg", key: "products/x/original.jpg", position: 0 },
  });
  imageId = image.id;

  mockedGetObject.mockResolvedValue(original);
  mockedPutObject.mockResolvedValue("https://example.com/preview.webp");
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("POST /api/images/treatment-preview-raw — foto staged", () => {
  it("operations [enhance_color médio] (string JSON no multipart): devolve imagem com saturação média maior", async () => {
    const before = await colorStats(original);

    const res = await request(app)
      .post("/api/images/treatment-preview-raw")
      .set("Authorization", `Bearer ${token}`)
      .field("operations", JSON.stringify([{ operation: "enhance_color", level: "medio" }]))
      .attach("file", original, { filename: "foto.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(res.body.unclear).toBe(false);
    expect(res.body.operations).toEqual([{ operation: "enhance_color", level: "medio" }]);
    expect(mockedInterpret).not.toHaveBeenCalled();

    const after = await colorStats(bufferFromDataUrl(res.body.previewDataUrl));
    expect(after.meanSaturation).toBeGreaterThan(before.meanSaturation * 1.1);
  });

  it('instruction "realça as cores" (Claude mockada → enhance_color médio): saturação média maior', async () => {
    mockedInterpret.mockResolvedValue({ unclear: false, operations: [{ operation: "enhance_color", level: "medio" }] });
    const before = await colorStats(original);

    const res = await request(app)
      .post("/api/images/treatment-preview-raw")
      .set("Authorization", `Bearer ${token}`)
      .field("instruction", "realça as cores")
      .attach("file", original, { filename: "foto.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(mockedInterpret).toHaveBeenCalledWith("realça as cores");
    const after = await colorStats(bufferFromDataUrl(res.body.previewDataUrl));
    expect(after.meanSaturation).toBeGreaterThan(before.meanSaturation * 1.1);
  });

  it("cada nível produz saturação progressivamente maior (original < leve < médio < forte) sem estourar canais", async () => {
    const before = await colorStats(original);
    const results: Record<string, { meanSaturation: number; clippedPct: number }> = {};

    for (const level of ["leve", "medio", "forte"] as const) {
      const res = await request(app)
        .post("/api/images/treatment-preview-raw")
        .set("Authorization", `Bearer ${token}`)
        .field("operations", JSON.stringify([{ operation: "enhance_color", level }]))
        .attach("file", original, { filename: "foto.jpg", contentType: "image/jpeg" });
      expect(res.status).toBe(200);
      results[level] = await colorStats(bufferFromDataUrl(res.body.previewDataUrl));
    }

    expect(results.leve.meanSaturation).toBeGreaterThan(before.meanSaturation);
    expect(results.medio.meanSaturation).toBeGreaterThan(results.leve.meanSaturation);
    expect(results.forte.meanSaturation).toBeGreaterThan(results.medio.meanSaturation);
    for (const level of ["leve", "medio", "forte"]) {
      expect(results[level].clippedPct).toBeLessThan(5);
    }
  });

  it("nada é gravado: nem R2 nem banco", async () => {
    const imagesBefore = await prisma.productImage.count();
    await request(app)
      .post("/api/images/treatment-preview-raw")
      .set("Authorization", `Bearer ${token}`)
      .field("operations", JSON.stringify([{ operation: "enhance_color", level: "forte" }]))
      .attach("file", original, { filename: "foto.jpg", contentType: "image/jpeg" });

    expect(mockedPutObject).not.toHaveBeenCalled();
    expect(mockedGetObject).not.toHaveBeenCalled();
    expect(await prisma.productImage.count()).toBe(imagesBefore);
  });
});

describe("POST /treatment/preview — foto salva (R2 mockado)", () => {
  it("operations [enhance_color médio]: a imagem enviada ao R2 tem saturação média maior", async () => {
    const before = await colorStats(original);

    const res = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/preview`)
      .set("Authorization", `Bearer ${token}`)
      .send({ operations: [{ operation: "enhance_color", level: "medio" }] });

    expect(res.status).toBe(200);
    expect(res.body.previewUrl).toBe("https://example.com/preview.webp");
    const uploaded = mockedPutObject.mock.calls[0][1] as Buffer;
    const after = await colorStats(uploaded);
    expect(after.meanSaturation).toBeGreaterThan(before.meanSaturation * 1.1);
  });

  it('instruction "realça as cores" (Claude mockada): mesma exigência', async () => {
    mockedInterpret.mockResolvedValue({ unclear: false, operations: [{ operation: "enhance_color", level: "medio" }] });
    const before = await colorStats(original);

    const res = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/preview`)
      .set("Authorization", `Bearer ${token}`)
      .send({ instruction: "realça as cores" });

    expect(res.status).toBe(200);
    const uploaded = mockedPutObject.mock.calls[0][1] as Buffer;
    expect((await colorStats(uploaded)).meanSaturation).toBeGreaterThan(before.meanSaturation * 1.1);
  });

  it("cada nível produz saturação progressivamente maior", async () => {
    const before = await colorStats(original);
    const sats: number[] = [];

    for (const level of ["leve", "medio", "forte"] as const) {
      mockedPutObject.mockClear();
      const res = await request(app)
        .post(`/api/products/${productId}/images/${imageId}/treatment/preview`)
        .set("Authorization", `Bearer ${token}`)
        .send({ operations: [{ operation: "enhance_color", level }] });
      expect(res.status).toBe(200);
      sats.push((await colorStats(mockedPutObject.mock.calls[0][1] as Buffer)).meanSaturation);
    }

    expect(sats[0]).toBeGreaterThan(before.meanSaturation);
    expect(sats[1]).toBeGreaterThan(sats[0]);
    expect(sats[2]).toBeGreaterThan(sats[1]);
  });
});
