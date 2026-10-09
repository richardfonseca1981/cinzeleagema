import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import "./setup";

// Mocka Claude, R2 e rembg — Sharp, zod, multer, Prisma (banco de teste) e as
// rotas rodam de verdade.
vi.mock("../src/lib/claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/claude")>();
  return { ...actual, interpretPhotoInstruction: vi.fn() };
});
vi.mock("../src/lib/rembg", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/rembg")>();
  return { ...actual, removeBackground: vi.fn() };
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
import { removeBackground } from "../src/lib/rembg";
import * as r2 from "../src/lib/r2";
import { cleanDatabase, generateTestToken } from "./helpers";

const mockedInterpret = vi.mocked(interpretPhotoInstruction);
const mockedRembg = vi.mocked(removeBackground);
const mockedGetObject = vi.mocked(r2.getObject);
const mockedPutObject = vi.mocked(r2.putObject);
const mockedDeleteObject = vi.mocked(r2.deleteObject);

const app = createApp();
const token = generateTestToken();

const SUBJECT = { r: 120, g: 60, b: 200 };

async function transparentPng(width: number, height: number, rect: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      const i = (y * width + x) * 4;
      raw[i] = SUBJECT.r;
      raw[i + 1] = SUBJECT.g;
      raw[i + 2] = SUBJECT.b;
      raw[i + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function opaquePhoto(width: number, height: number, rect: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  const piece = await sharp({ create: { width: rect.width, height: rect.height, channels: 3, background: SUBJECT } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .composite([{ input: piece, left: rect.left, top: rect.top }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function dims(buffer: Buffer): Promise<{ w?: number; h?: number; format?: string; hasAlpha?: boolean }> {
  const m = await sharp(buffer).metadata();
  return { w: m.width, h: m.height, format: m.format, hasAlpha: m.hasAlpha };
}

function bufferFromDataUrl(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

// Peça 500x400 descentralizada num PNG transparente 2000x1600 → recorta para 620x520.
const OFF_CENTER = { left: 1300, top: 200, width: 500, height: 400 };
const FITTED = { left: 100, top: 100, width: 1800, height: 1400 };

let productId: string;
let imageId: string;
let original: Buffer;

beforeEach(async () => {
  await cleanDatabase();
  for (const m of [mockedInterpret, mockedRembg, mockedGetObject, mockedPutObject, mockedDeleteObject]) m.mockReset();

  const category = await prisma.category.create({ data: { name: "Homedecor", slug: "homedecor" } });
  const product = await prisma.product.create({
    data: { name: "Peça de teste", slug: `peca-teste-${Date.now()}`, price: 100, categoryId: category.id },
  });
  productId = product.id;
  const image = await prisma.productImage.create({
    data: { productId, url: "https://example.com/original.png", key: "products/x/original.png", position: 0 },
  });
  imageId = image.id;

  original = await transparentPng(2000, 1600, OFF_CENTER);
  mockedGetObject.mockResolvedValue(original);
  mockedPutObject.mockImplementation(async (key: string) => `https://example.com/${key}`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

const previewUrl = () => `/api/products/${productId}/images/${imageId}/treatment/preview`;

describe("foto salva — operação autoFit (R2 mockado)", () => {
  it("operations [autoFit]: sobe um preview recortado em volta da peça (sem esticar) e devolve a mensagem", async () => {
    const res = await request(app).post(previewUrl()).set("Authorization", `Bearer ${token}`).send({ operations: [{ operation: "autoFit" }] });

    expect(res.status).toBe(200);
    expect(res.body.unclear).toBe(false);
    expect(res.body.operations).toEqual([{ operation: "autoFit" }]);
    expect(res.body.previewUrl).toMatch(/^https:\/\/example\.com\/products\/.+\/previews\//);
    expect(res.body.notice).toMatch(/Peça enquadrada/);
    expect(mockedInterpret).not.toHaveBeenCalled();

    const uploaded = mockedPutObject.mock.calls[0][1] as Buffer;
    expect(await dims(uploaded)).toMatchObject({ w: 620, h: 1103, format: "webp" });
  });

  it('instruction "enquadra a peça" (Claude mockada → autoFit): mesmo resultado', async () => {
    mockedInterpret.mockResolvedValue({ unclear: false, operations: [{ operation: "autoFit" }] });

    const res = await request(app).post(previewUrl()).set("Authorization", `Bearer ${token}`).send({ instruction: "enquadra a peça" });

    expect(res.status).toBe(200);
    expect(mockedInterpret).toHaveBeenCalledWith("enquadra a peça");
    expect(await dims(mockedPutObject.mock.calls[0][1] as Buffer)).toMatchObject({ w: 620, h: 1103 });
  });

  it("peça que já ocupa bem o quadro: 200 com noChange e razão amigável, sem erro e sem gravar no R2", async () => {
    mockedGetObject.mockResolvedValue(await transparentPng(2000, 1600, FITTED));

    const res = await request(app).post(previewUrl()).set("Authorization", `Bearer ${token}`).send({ operations: [{ operation: "autoFit" }] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ unclear: false, noChange: true, notice: "A peça já ocupa bem o quadro — não há o que enquadrar." });
    expect(res.body.previewUrl).toBeUndefined();
    expect(mockedPutObject).not.toHaveBeenCalled();
  });

  it("autoFit combinado com outra operação mesmo sem recorte: segue com preview e traz o aviso", async () => {
    mockedGetObject.mockResolvedValue(await transparentPng(2000, 1600, FITTED));

    const res = await request(app)
      .post(previewUrl())
      .set("Authorization", `Bearer ${token}`)
      .send({ operations: [{ operation: "autoFit" }, { operation: "brightness", value: 10 }] });

    expect(res.status).toBe(200);
    expect(res.body.noChange).toBeUndefined();
    expect(res.body.previewUrl).toBeDefined();
    expect(res.body.notice).toMatch(/já ocupa bem o quadro/);
  });

  it("fluxo completo: preview -> confirmar (guarda a anterior) -> desfazer (volta ao original)", async () => {
    const preview = await request(app).post(previewUrl()).set("Authorization", `Bearer ${token}`).send({ operations: [{ operation: "autoFit" }] });

    const confirm = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ previewUrl: preview.body.previewUrl, previewKey: preview.body.previewKey });
    expect(confirm.status).toBe(200);
    expect(confirm.body).toMatchObject({
      url: preview.body.previewUrl,
      key: preview.body.previewKey,
      previousUrl: "https://example.com/original.png",
      previousKey: "products/x/original.png",
    });

    const undo = await request(app).post(`/api/products/${productId}/images/${imageId}/undo`).set("Authorization", `Bearer ${token}`);
    expect(undo.status).toBe(200);
    expect(undo.body).toMatchObject({ url: "https://example.com/original.png", key: "products/x/original.png", previousUrl: null, previousKey: null });
  });

  it("descartar o preview não apaga nada no R2 e não altera a foto", async () => {
    const preview = await request(app).post(previewUrl()).set("Authorization", `Bearer ${token}`).send({ operations: [{ operation: "autoFit" }] });

    const discard = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/discard`)
      .set("Authorization", `Bearer ${token}`)
      .send({ previewKey: preview.body.previewKey });

    expect(discard.status).toBe(204);
    expect(mockedDeleteObject).not.toHaveBeenCalled(); // nenhuma rota de tratamento apaga arquivos
    expect((await prisma.productImage.findUnique({ where: { id: imageId } }))!.url).toBe("https://example.com/original.png");
  });
});

describe("foto staged — rota sem estado", () => {
  const raw = (extra: (r: request.Test) => request.Test, file: Buffer, name = "foto.png", type = "image/png") =>
    extra(
      request(app)
        .post("/api/images/treatment-preview-raw")
        .set("Authorization", `Bearer ${token}`)
        .attach("file", file, { filename: name, contentType: type })
    );

  it("operations [autoFit] (string JSON no multipart): devolve a imagem recortada e nada é gravado", async () => {
    const rowsBefore = await prisma.productImage.count();

    const res = await raw((r) => r.field("operations", JSON.stringify([{ operation: "autoFit" }])), original);

    expect(res.status).toBe(200);
    expect(res.body.unclear).toBe(false);
    expect(res.body.notice).toMatch(/Peça enquadrada/);
    expect(await dims(bufferFromDataUrl(res.body.previewDataUrl))).toMatchObject({ w: 620, h: 1103, format: "webp" });

    expect(mockedPutObject).not.toHaveBeenCalled();
    expect(mockedGetObject).not.toHaveBeenCalled();
    expect(await prisma.productImage.count()).toBe(rowsBefore);
  });

  it('instruction "centraliza a pedra" (Claude mockada → autoFit)', async () => {
    mockedInterpret.mockResolvedValue({ unclear: false, operations: [{ operation: "autoFit" }] });
    const res = await raw((r) => r.field("instruction", "centraliza a pedra"), original);
    expect(res.status).toBe(200);
    expect(await dims(bufferFromDataUrl(res.body.previewDataUrl))).toMatchObject({ w: 620, h: 1103 });
  });

  it("peça já enquadrada: noChange com razão amigável (sem previewDataUrl)", async () => {
    const res = await raw((r) => r.field("operations", JSON.stringify([{ operation: "autoFit" }])), await transparentPng(2000, 1600, FITTED));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ unclear: false, noChange: true, notice: "A peça já ocupa bem o quadro — não há o que enquadrar." });
    expect(res.body.previewDataUrl).toBeUndefined();
  });

  it("foto opaca (rembg mockado só localiza): recorta a original, mantém JPEG e não introduz transparência", async () => {
    const subject = { left: 900, top: 100, width: 600, height: 450 };
    mockedRembg.mockResolvedValue(await transparentPng(1600, 1200, subject));

    const res = await raw((r) => r.field("operations", JSON.stringify([{ operation: "autoFit" }])), await opaquePhoto(1600, 1200, subject), "foto.jpg", "image/jpeg");

    expect(res.status).toBe(200);
    expect(await dims(bufferFromDataUrl(res.body.previewDataUrl))).toMatchObject({ w: 744, h: 1323, format: "webp", hasAlpha: false });
  });

  it("rembg indisponível numa foto opaca: noChange com mensagem clara, não 500", async () => {
    mockedRembg.mockRejectedValue(new Error("down"));
    const subject = { left: 900, top: 100, width: 600, height: 450 };

    const res = await raw((r) => r.field("operations", JSON.stringify([{ operation: "autoFit" }])), await opaquePhoto(1600, 1200, subject), "foto.jpg", "image/jpeg");

    expect(res.status).toBe(200);
    expect(res.body.noChange).toBe(true);
    expect(res.body.notice).toMatch(/indisponível/);
  });
});
