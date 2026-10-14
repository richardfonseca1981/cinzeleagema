import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import "./setup";

vi.mock("../src/lib/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/r2")>();
  return { ...actual, isR2Configured: vi.fn(() => true), putObject: vi.fn(), deleteObject: vi.fn(), getObject: vi.fn() };
});

import * as photoFormat from "../src/lib/photoFormat";
import {
  HEIC_MESSAGE,
  isHeic,
  isPortrait916,
  normalizeToPortrait,
  planPortraitCanvas,
  PHOTO_MAX_LONG_SIDE,
} from "../src/lib/photoFormat";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import * as r2 from "../src/lib/r2";
import { cleanDatabase, generateTestToken } from "./helpers";

// Foto sintética: fundo cinza, "bandeja" branca e uma "pedra" roxa em cima.
// As cores ficam em posições proporcionais, para comparar a composição.
const GRAY = { r: 128, g: 128, b: 128 };
const STONE = { r: 120, g: 30, b: 200 };

async function scene(width: number, height: number, format: "jpeg" | "png" = "jpeg"): Promise<Buffer> {
  const stone = { w: Math.round(width * 0.4), h: Math.round(height * 0.3) };
  const left = Math.round(width * 0.3);
  const top = Math.round(height * 0.35);
  const stoneBuf = await sharp({ create: { width: stone.w, height: stone.h, channels: 3, background: STONE } }).png().toBuffer();
  const base = sharp({ create: { width, height, channels: 3, background: GRAY } }).composite([{ input: stoneBuf, left, top }]);
  return format === "png" ? base.png().toBuffer() : base.jpeg({ quality: 95 }).toBuffer();
}

async function pixel(buf: Buffer, xRatio: number, yRatio: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const x = Math.min(info.width - 1, Math.round(info.width * xRatio));
  const y = Math.min(info.height - 1, Math.round(info.height * yRatio));
  const i = (y * info.width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
}

function near(a: number[], b: { r: number; g: number; b: number }, tol = 12) {
  return Math.abs(a[0] - b.r) <= tol && Math.abs(a[1] - b.g) <= tol && Math.abs(a[2] - b.b) <= tol;
}

describe("constantes 9:16 iguais no backend e no frontend", () => {
  it("photoFormat.ts do frontend tem os mesmos valores", () => {
    const front = fs.readFileSync(path.resolve(__dirname, "../../frontend/src/lib/photoFormat.ts"), "utf8");
    const read = (name: string) => {
      const m = front.match(new RegExp(`export const ${name} = ([0-9.]+);`));
      if (!m) throw new Error(`constante ${name} não encontrada no frontend`);
      return Number(m[1]);
    };
    for (const name of [
      "PHOTO_ASPECT_WIDTH",
      "PHOTO_ASPECT_HEIGHT",
      "PHOTO_ASPECT_TOLERANCE",
      "PHOTO_MAX_LONG_SIDE",
      "PHOTO_MIN_WIDTH",
      "PHOTO_MIN_HEIGHT",
      "MAX_PHOTOS_PER_PRODUCT",
    ] as const) {
      expect(read(name), name).toBe(photoFormat[name]);
    }
    expect(photoFormat.PHOTO_ASPECT_WIDTH / photoFormat.PHOTO_ASPECT_HEIGHT).toBeLessThan(1); // em pé
  });
});

describe("planPortraitCanvas", () => {
  it("9:16 exato fica como está (sem ampliar nem recortar)", () => {
    expect(planPortraitCanvas(720, 1280)).toEqual({ mode: "keep", width: 720, height: 1280 });
  });

  it("9:16 acima de 1920 px só reduz (4536×8064 → 1080×1920)", () => {
    expect(planPortraitCanvas(4536, 8064)).toEqual({ mode: "keep", width: 1080, height: 1920 });
  });

  it("tolerância de 3%", () => {
    expect(isPortrait916(740, 1280)).toBe(true); // +2,8%
    expect(isPortrait916(760, 1280)).toBe(false);
  });

  it.each([
    ["3:4", 900, 1200],
    ["4:3", 1200, 900],
    ["1:1", 1000, 1000],
  ])("%s: a foto cabe inteira no canvas 9:16 e nunca é ampliada", (_n, w, h) => {
    const plan = planPortraitCanvas(w, h);
    if (plan.mode !== "fit") throw new Error("esperava fit");
    expect(plan.canvasWidth / plan.canvasHeight).toBeCloseTo(9 / 16, 2);
    expect(plan.width).toBeLessThanOrEqual(plan.canvasWidth);
    expect(plan.height).toBeLessThanOrEqual(plan.canvasHeight);
    expect(plan.width).toBeLessThanOrEqual(w);
    expect(plan.height).toBeLessThanOrEqual(h);
    expect(plan.width / plan.height).toBeCloseTo(w / h, 1);
    expect(plan.canvasHeight).toBeLessThanOrEqual(PHOTO_MAX_LONG_SIDE);
  });
});

describe("normalizeToPortrait", () => {
  it("720×1280 em 9:16: mesma composição e mesmas proporções (sem recorte, sem zoom)", async () => {
    const input = await scene(720, 1280);
    const out = await normalizeToPortrait(input);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([720, 1280]);
    // sem EXIF/metadados: devolve os mesmos bytes
    expect(out.action).toBe("unchanged");
    expect(out.buffer.equals(input)).toBe(true);
  });

  it("720×1280 com EXIF é regravado, mas mantém dimensões e posições da peça", async () => {
    const input = await sharp(await scene(720, 1280)).withExif({ IFD0: { Copyright: "x" } }).jpeg().toBuffer();
    const out = await normalizeToPortrait(input);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([720, 1280]);
    expect(out.action).toBe("kept");
    // centro da peça e cantos do fundo nas mesmas posições relativas
    expect(near(await pixel(out.buffer, 0.5, 0.5), STONE)).toBe(true);
    expect(near(await pixel(out.buffer, 0.31, 0.36), STONE)).toBe(true);
    expect(near(await pixel(out.buffer, 0.28, 0.5), GRAY)).toBe(true); // logo à esquerda da peça
    expect(near(await pixel(out.buffer, 0.02, 0.02), GRAY)).toBe(true);
  });

  it("4536×8064 (36 MP) vira 1080×1920 inteiro", async () => {
    const input = await scene(4536, 8064);
    const out = await normalizeToPortrait(input);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1920]);
    expect(near(await pixel(out.buffer, 0.5, 0.5), STONE)).toBe(true);
  }, 60000);

  it.each([
    ["3:4", 900, 1200],
    ["4:3", 1200, 900],
    ["1:1", 1000, 1000],
  ])("%s sai em 9:16, com a peça inteira e fundo desfocado da própria foto", async (_n, w, h) => {
    const out = await normalizeToPortrait(await scene(w, h));
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width! / meta.height!).toBeCloseTo(9 / 16, 2);
    expect(meta.height!).toBeLessThanOrEqual(PHOTO_MAX_LONG_SIDE);

    // a peça aparece inteira: bordas da peça (40%×30% da foto) dentro do canvas
    const plan = planPortraitCanvas(w, h);
    if (plan.mode !== "fit") throw new Error("fit");
    const x0 = plan.left + plan.width * 0.3;
    const y0 = plan.top + plan.height * 0.35;
    const px = async (x: number, y: number) => pixel(out.buffer, x / meta.width!, y / meta.height!);
    expect(near(await px(x0 + plan.width * 0.05, y0 + plan.height * 0.03), STONE, 20)).toBe(true);
    expect(near(await px(x0 + plan.width * 0.35, y0 + plan.height * 0.27), STONE, 20)).toBe(true);
    // fundo vem da própria foto (cinza), não de uma cor fixa
    expect(near(await px(2, 2), GRAY, 14)).toBe(true);
    expect(near(await px(meta.width! - 3, meta.height! - 3), GRAY, 14)).toBe(true);
  });

  it("foto deitada pequena não é ampliada (canvas = menor 9:16 que a contém)", async () => {
    const out = await normalizeToPortrait(await scene(400, 300));
    const meta = await sharp(out.buffer).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(Math.ceil((400 * 16) / 9));
  });

  it("aplica a orientação EXIF: foto em pé do iPhone não sai deitada", async () => {
    // pixels gravados deitados (1280×720) + EXIF orientation 6 => exibida em pé 720×1280
    const landscapeRaw = await scene(1280, 720);
    const input = await sharp(landscapeRaw).withMetadata({ orientation: 6 }).jpeg({ quality: 95 }).toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);

    const out = await normalizeToPortrait(input);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([720, 1280]);
    expect(out.action).toBe("kept");
    // a peça (centro) segue no centro; a orientação foi aplicada sem recorte
    expect(near(await pixel(out.buffer, 0.5, 0.5), STONE)).toBe(true);
  });

  it("a imagem salva não tem EXIF nem GPS (nem ICC/XMP)", async () => {
    const gpsJpeg = await sharp(await scene(1200, 900))
      .withExif({
        IFD0: { Copyright: "Fulano", Make: "Apple" },
        IFD3: { GPSLatitudeRef: "S", GPSLatitude: "23/1 33/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "46/1 38/1 0/1" },
      })
      .jpeg()
      .toBuffer();
    // sanidade: a entrada realmente tem EXIF e GPS
    const inMeta = await sharp(gpsJpeg).metadata();
    expect(inMeta.exif).toBeDefined();
    expect(gpsJpeg.includes(Buffer.from("Apple"))).toBe(true);
    // e o bloco EXIF traz o ponteiro do GPS IFD (tag 0x8825, little ou big endian)
    expect(inMeta.exif!.includes(Buffer.from([0x25, 0x88])) || inMeta.exif!.includes(Buffer.from([0x88, 0x25]))).toBe(true);

    for (const input of [gpsJpeg, await sharp(await scene(720, 1280)).withExif({ IFD0: { Make: "Apple" } }).jpeg().toBuffer()]) {
      const out = await normalizeToPortrait(input);
      const meta = await sharp(out.buffer).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(out.buffer.includes(Buffer.from("Apple"))).toBe(false);
      expect(out.buffer.includes(Buffer.from("Exif"))).toBe(false);
      expect(out.buffer.includes(Buffer.from("EXIF"))).toBe(false);
      expect(out.buffer.includes(Buffer.from("GPS"))).toBe(false);
    }
  });

  it("PNG com transparência: mantém a peça inteira em canvas 9:16", async () => {
    const png = await sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 300, height: 300, channels: 3, background: STONE } }).png().toBuffer(), left: 250, top: 150 }])
      .png()
      .toBuffer();
    const out = await normalizeToPortrait(png);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.width! / meta.height!).toBeCloseTo(9 / 16, 2);
    expect(near(await pixel(out.buffer, 0.5, 0.5), STONE)).toBe(true);
  });

  it("HEIC/HEIF: mensagem clara em português (415)", async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(32)]);
    expect(isHeic(heic)).toBe(true);
    await expect(normalizeToPortrait(heic)).rejects.toMatchObject({ status: 415, message: HEIC_MESSAGE });
    const avif = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypavif"), Buffer.alloc(32)]);
    expect(isHeic(avif)).toBe(false);
  });

  it("arquivo que não é imagem: 422 em português", async () => {
    await expect(normalizeToPortrait(Buffer.from("isto nao e uma imagem"))).rejects.toMatchObject({ status: 422 });
  });

  it("várias fotos ao mesmo tempo são processadas uma por vez (sem estourar memória)", async () => {
    const inputs = await Promise.all([scene(1000, 1000), scene(900, 1600), scene(1200, 900)]);
    const outs = await Promise.all(inputs.map((i) => normalizeToPortrait(i)));
    expect(outs).toHaveLength(3);
    for (const o of outs) expect((await sharp(o.buffer).metadata()).width! / (await sharp(o.buffer).metadata()).height!).toBeCloseTo(9 / 16, 1);
  });
});

describe("POST /api/products/:id/images/upload", () => {
  const app = createApp();
  const token = generateTestToken();
  let productId: string;
  const mockedPut = vi.mocked(r2.putObject);

  beforeAll(async () => {
    await cleanDatabase();
    const category = await prisma.category.create({ data: { name: "Homedecor", slug: "homedecor" } });
    const product = await prisma.product.create({ data: { name: "Peça", slug: "peca-9x16", price: 10, categoryId: category.id } });
    productId = product.id;
    mockedPut.mockImplementation(async (key: string) => `https://cdn.test/${key}`);
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it("recusa sem autenticação", async () => {
    const res = await request(app).post(`/api/products/${productId}/images/upload`).attach("file", await scene(100, 100), "a.jpg");
    expect(res.status).toBe(401);
  });

  it("processa para 9:16 sem EXIF, grava no R2 e cria o registro", async () => {
    mockedPut.mockClear();
    const input = await sharp(await scene(1200, 900)).withExif({ IFD0: { Make: "Apple" } }).jpeg().toBuffer();
    const res = await request(app)
      .post(`/api/products/${productId}/images/upload`)
      .set("Authorization", `Bearer ${token}`)
      .field("colorEnhanced", "true")
      .field("colorEnhanceLevel", "leve")
      .attach("file", input, "foto.jpg");

    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^https:\/\/cdn\.test\/products\/.+\.webp$/);
    expect(res.body.colorEnhanced).toBe(true);
    expect(res.body.colorEnhanceLevel).toBe("leve");
    const [key, body, contentType] = mockedPut.mock.calls[0];
    expect(key).toMatch(/^products\/.+\.webp$/);
    expect(contentType).toBe("image/webp");
    const meta = await sharp(body as Buffer).metadata();
    expect(meta.width! / meta.height!).toBeCloseTo(9 / 16, 2);
    expect(meta.exif).toBeUndefined();
    expect((body as Buffer).includes(Buffer.from("Apple"))).toBe(false);
  });

  it("HEIC volta 415 com mensagem em português", async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(32)]);
    const res = await request(app)
      .post(`/api/products/${productId}/images/upload`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", heic, "IMG_0001.HEIC");
    expect(res.status).toBe(415);
    expect(res.body.error).toBe(HEIC_MESSAGE);
  });

  it("sem arquivo: 400", async () => {
    const res = await request(app).post(`/api/products/${productId}/images/upload`).set("Authorization", `Bearer ${token}`).field("x", "y");
    expect(res.status).toBe(400);
  });

  it("arquivo acima de 15 MB: 413 com mensagem clara", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/images/upload`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.alloc(16 * 1024 * 1024, 1), "grande.jpg");
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/15 MB/);
  });
});
