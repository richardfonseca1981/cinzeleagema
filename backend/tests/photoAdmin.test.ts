import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import "./setup";

vi.mock("../src/lib/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/r2")>();
  return { ...actual, isR2Configured: vi.fn(() => true), putObject: vi.fn(), deleteObject: vi.fn(), getObject: vi.fn() };
});

import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import * as r2 from "../src/lib/r2";
import { MAX_PHOTOS_PER_PRODUCT } from "../src/lib/photoFormat";
import { applyOperations, executeOperations, operationsSchema } from "../src/lib/imageOperations";
import { cleanDatabase, generateTestToken } from "./helpers";

const app = createApp();
const auth = { Authorization: `Bearer ${generateTestToken()}` };
const mockedPut = vi.mocked(r2.putObject);
const mockedGet = vi.mocked(r2.getObject);
const mockedDelete = vi.mocked(r2.deleteObject);

const jpeg = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 90, g: 120, b: 150 } } }).jpeg().toBuffer();

let productId: string;
let otherProductId: string;

beforeEach(async () => {
  await cleanDatabase();
  for (const m of [mockedPut, mockedGet, mockedDelete]) m.mockReset();
  mockedPut.mockImplementation(async (key: string) => `https://cdn.test/${key}`);
  const category = await prisma.category.create({ data: { name: "Homedecor", slug: "homedecor" } });
  const mk = (slug: string) => prisma.product.create({ data: { name: slug, slug, sku: `sku-${slug}`, price: 10, categoryId: category.id } });
  productId = (await mk("peca-a")).id;
  otherProductId = (await mk("peca-b")).id;
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

const img = (data: { productId?: string; key: string; previousKey?: string; position?: number; width?: number; height?: number }) =>
  prisma.productImage.create({
    data: {
      productId: data.productId ?? productId,
      url: `https://cdn.test/${data.key}`,
      key: data.key,
      previousKey: data.previousKey ?? null,
      previousUrl: data.previousKey ? `https://cdn.test/${data.previousKey}` : null,
      position: data.position ?? 0,
      width: data.width ?? null,
      height: data.height ?? null,
    },
  });

describe("rotas antigas de upload por URL assinada foram removidas", () => {
  it("presign e o registro direto (POST /images) não existem mais", async () => {
    const presign = await request(app).post(`/api/products/${productId}/images/presign`).set(auth).send({ fileName: "a.jpg", contentType: "image/jpeg" });
    expect(presign.status).toBe(404);
    const confirm = await request(app).post(`/api/products/${productId}/images`).set(auth).send({ url: "https://x/y.jpg", key: "products/x/y.jpg" });
    expect(confirm.status).toBe(404);
    expect(await prisma.productImage.count()).toBe(0);
  });
});

describe("troca de fotos: upload novo", () => {
  it("cada foto nova ganha chave nova (UUID), posição seguinte e dimensões 9:16", async () => {
    const a = await request(app).post(`/api/products/${productId}/images/upload`).set(auth).attach("file", await jpeg(720, 1280), "foto.jpg");
    const b = await request(app).post(`/api/products/${productId}/images/upload`).set(auth).attach("file", await jpeg(720, 1280), "foto.jpg");
    expect(a.status).toBe(201);
    expect(a.body.key).not.toBe(b.body.key);
    expect([a.body.position, b.body.position]).toEqual([0, 1]);
    expect([a.body.width, a.body.height]).toEqual([720, 1280]);
    expect(a.body.colorEnhanced).toBe(false);
    // mesmo nome de arquivo enviado duas vezes não vira a mesma chave
    expect(mockedPut.mock.calls[0][0]).not.toBe(mockedPut.mock.calls[1][0]);
  });

  it(`recusa a foto número ${MAX_PHOTOS_PER_PRODUCT + 1} com mensagem em português`, async () => {
    for (let i = 0; i < MAX_PHOTOS_PER_PRODUCT; i++) await img({ key: `products/${productId}/f${i}.webp`, position: i });
    const res = await request(app).post(`/api/products/${productId}/images/upload`).set(auth).attach("file", await jpeg(720, 1280), "foto.jpg");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(`Limite de ${MAX_PHOTOS_PER_PRODUCT} fotos por peça atingido. Apague uma foto antes de enviar outra.`);
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it("reordenar define a capa (posição 0) sem mexer no produto", async () => {
    const a = await img({ key: "products/a.webp", position: 0 });
    const b = await img({ key: "products/b.webp", position: 1 });
    const res = await request(app).patch(`/api/products/${productId}/images/reorder`).set(auth).send({ order: [b.id, a.id] });
    expect(res.status).toBe(200);
    expect(res.body.map((i: { id: string }) => i.id)).toEqual([b.id, a.id]);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product).toMatchObject({ slug: "peca-a", sku: "sku-peca-a" });
  });
});

describe("DELETE /images/:imageId — única exclusão de arquivos", () => {
  it("remove registro, imagem atual e o 'antes' (previousKey) do R2", async () => {
    const photo = await img({ key: "products/p/atual.webp", previousKey: "products/p/antes.jpg" });
    const res = await request(app).delete(`/api/products/${productId}/images/${photo.id}`).set(auth);
    expect(res.status).toBe(204);
    expect(await prisma.productImage.findUnique({ where: { id: photo.id } })).toBeNull();
    expect(mockedDelete.mock.calls.map((c) => c[0]).sort()).toEqual(["products/p/antes.jpg", "products/p/atual.webp"]);
  });

  it("não apaga arquivo que outra foto (mesmo de outro produto) ainda usa", async () => {
    const photo = await img({ key: "products/p/atual.webp", previousKey: "products/p/compartilhado.jpg" });
    await img({ productId: otherProductId, key: "products/q/outra.webp", previousKey: "products/p/compartilhado.jpg" });
    await img({ productId: otherProductId, key: "products/p/atual.webp", position: 1 });
    const res = await request(app).delete(`/api/products/${productId}/images/${photo.id}`).set(auth);
    expect(res.status).toBe(204);
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(await prisma.productImage.count()).toBe(2);
  });

  it("apaga uma foto por vez: as outras da peça ficam intactas", async () => {
    const a = await img({ key: "products/p/a.webp", position: 0 });
    const b = await img({ key: "products/p/b.webp", position: 1 });
    await request(app).delete(`/api/products/${productId}/images/${a.id}`).set(auth);
    expect(mockedDelete.mock.calls.map((c) => c[0])).toEqual(["products/p/a.webp"]);
    expect(await prisma.productImage.findUnique({ where: { id: b.id } })).not.toBeNull();
  });

  it("foto de outro produto: 404 e nada é apagado", async () => {
    const photo = await img({ productId: otherProductId, key: "products/q/x.webp" });
    const res = await request(app).delete(`/api/products/${productId}/images/${photo.id}`).set(auth);
    expect(res.status).toBe(404);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("exige login", async () => {
    const photo = await img({ key: "products/p/a.webp" });
    expect((await request(app).delete(`/api/products/${productId}/images/${photo.id}`)).status).toBe(401);
  });
});

describe("tratamento de foto sempre sai em 9:16", () => {
  it("crop 16:9 deitado deixou de existir; 9:16 é aceito", () => {
    expect(operationsSchema.safeParse([{ operation: "crop", aspectRatio: "16:9" }]).success).toBe(false);
    expect(operationsSchema.safeParse([{ operation: "crop", aspectRatio: "9:16" }]).success).toBe(true);
  });

  it.each([
    ["crop 4:3", [{ operation: "crop", aspectRatio: "4:3" }]],
    ["crop 1:1", [{ operation: "crop", aspectRatio: "1:1" }]],
    ["girar 90°", [{ operation: "rotate", degrees: 90 }]],
    ["nitidez", [{ operation: "sharpen", intensity: "leve" }]],
    ["realce de cor", [{ operation: "enhance_color", level: "leve" }]],
    ["redimensionar", [{ operation: "resize", width: 300 }]],
  ] as const)("%s sobre foto 9:16 termina em 9:16", async (_n, ops) => {
    const out = await executeOperations(await jpeg(720, 1280), ops as never);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.width! / meta.height!).toBeCloseTo(9 / 16, 2);
    expect(meta.exif).toBeUndefined();
  });

  it("sem normalização o crop 4:3 ficaria deitado (prova que a normalização age)", async () => {
    const raw = await applyOperations(await jpeg(720, 1280), [{ operation: "crop", aspectRatio: "4:3" }]);
    const meta = await sharp(raw.buffer).metadata();
    expect(meta.width! / meta.height!).toBeCloseTo(4 / 3, 1);
  });
});

describe("indicador 9:16 do admin", () => {
  it("GET /products/photo-stats conta só peças cuja capa está em 9:16", async () => {
    await img({ key: "products/a.webp", position: 0, width: 720, height: 1280 }); // peça A: capa 9:16
    await img({ key: "products/a2.webp", position: 1, width: 800, height: 800 });
    await img({ productId: otherProductId, key: "products/b.webp", position: 0 }); // peça B: foto antiga, sem dimensões
    const res = await request(app).get("/api/products/photo-stats").set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 2, portrait: 1 });
  });

  it("capa que não é 9:16 (ou peça sem foto) conta como 'a trocar'", async () => {
    await img({ key: "products/a.webp", width: 1200, height: 900 });
    const res = await request(app).get("/api/products/photo-stats").set(auth);
    expect(res.body).toEqual({ total: 2, portrait: 0 });
  });

  it("exige login", async () => {
    expect((await request(app).get("/api/products/photo-stats")).status).toBe(401);
  });

  it("confirmar um tratamento grava as dimensões da foto nova; desfazer restaura as da anterior", async () => {
    const photo = await img({ key: "products/p/old.jpg", width: null as never });
    mockedGet.mockImplementation(async (key: string) => (key.includes("preview") ? jpeg(720, 1280) : jpeg(1200, 900)));
    const confirm = await request(app)
      .post(`/api/products/${productId}/images/${photo.id}/treatment/confirm`)
      .set(auth)
      .send({ previewUrl: "https://cdn.test/products/p/previews/n.webp", previewKey: "products/p/previews/n.webp" });
    expect([confirm.body.width, confirm.body.height]).toEqual([720, 1280]);
    const undo = await request(app).post(`/api/products/${productId}/images/${photo.id}/undo`).set(auth);
    expect([undo.body.width, undo.body.height]).toEqual([1200, 900]);
  });
});
