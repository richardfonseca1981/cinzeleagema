import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import "./setup";

// Mocka a Claude API e o R2 — o resto (zod, Sharp, rotas) roda de verdade.
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
import { env } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";
import { interpretPhotoInstruction } from "../src/lib/claude";
import * as r2 from "../src/lib/r2";
import { cleanDatabase, generateTestToken } from "./helpers";

const mockedInterpret = vi.mocked(interpretPhotoInstruction);
const mockedGetObject = vi.mocked(r2.getObject);
const mockedPutObject = vi.mocked(r2.putObject);

// O setup padrão zera ANTHROPIC_API_KEY (nenhum teste chama a API real). Aqui a
// interpretação é mockada, mas a rota ainda exige "IA configurada": usa uma
// chave FALSA, que nunca sai do processo porque interpretPhotoInstruction é mock.
env.ANTHROPIC_API_KEY = "chave-falsa-de-teste";

const app = createApp();
const token = generateTestToken();

async function makeTestImage(): Promise<Buffer> {
  return sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 130, g: 95, b: 150 } } })
    .jpeg()
    .toBuffer();
}

let categoryId: string;
let productId: string;
let imageId: string;

beforeEach(async () => {
  await cleanDatabase();
  mockedInterpret.mockReset();
  mockedGetObject.mockReset();
  mockedPutObject.mockReset();

  const category = await prisma.category.create({ data: { name: "Homedecor", slug: "homedecor" } });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { name: "Peça de teste", slug: `peca-teste-${Date.now()}`, price: 100, categoryId },
  });
  productId = product.id;
  const image = await prisma.productImage.create({
    data: { productId, url: "https://example.com/original.jpg", key: "products/x/original.jpg", position: 0 },
  });
  imageId = image.id;

  mockedGetObject.mockResolvedValue(await makeTestImage());
  mockedPutObject.mockImplementation(async (key: string) => `https://example.com/${key}`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("POST /treatment/preview — atalhos do admin (operations, sem IA)", () => {
  it("processa enhance_color enviado como operations prontas, sem chamar a Claude API", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/preview`)
      .set("Authorization", `Bearer ${token}`)
      .send({ operations: [{ operation: "enhance_color", level: "medio" }] });

    expect(res.status).toBe(200);
    expect(res.body.unclear).toBe(false);
    expect(res.body.operations).toEqual([{ operation: "enhance_color", level: "medio" }]);
    expect(res.body.previewUrl).toMatch(/^https:\/\/example\.com\//);
    expect(mockedInterpret).not.toHaveBeenCalled();
  });

  it("rejeita um level fora do enum fechado mesmo vindo direto como operations", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/preview`)
      .set("Authorization", `Bearer ${token}`)
      .send({ operations: [{ operation: "enhance_color", level: "ultra" }] });

    expect(res.status).toBe(400);
    expect(mockedInterpret).not.toHaveBeenCalled();
  });

  it("não exige ANTHROPIC_API_KEY quando o pedido já vem com operations", async () => {
    // Sem mockar interpretPhotoInstruction como configurado — só confirma
    // que o caminho de operations nunca checa isAnthropicConfigured().
    const res = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/preview`)
      .set("Authorization", `Bearer ${token}`)
      .send({ operations: [{ operation: "sharpen", intensity: "leve" }] });

    expect(res.status).toBe(200);
    expect(mockedInterpret).not.toHaveBeenCalled();
  });
});

describe("POST /treatment/preview — texto livre (instruction, via Claude mockada)", () => {
  it("continua funcionando como antes: interpreta e executa", async () => {
    mockedInterpret.mockResolvedValue({ unclear: false, operations: [{ operation: "enhance_color", level: "forte" }] });

    const res = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/preview`)
      .set("Authorization", `Bearer ${token}`)
      .send({ instruction: "deixa bem mais colorida" });

    expect(res.status).toBe(200);
    expect(res.body.operations).toEqual([{ operation: "enhance_color", level: "forte" }]);
    expect(mockedInterpret).toHaveBeenCalledWith("deixa bem mais colorida");
  });

  it("rejeita corpo que não é nem instruction nem operations", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/preview`)
      .set("Authorization", `Bearer ${token}`)
      .send({ foo: "bar" });

    expect(res.status).toBe(400);
  });
});

describe("POST /treatment/confirm — metadados colorEnhanced", () => {
  it("marca colorEnhanced=true e guarda o nível quando o preview confirmado incluía enhance_color", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ previewUrl: "https://example.com/preview.webp", previewKey: "products/x/preview.webp", colorEnhanced: true, colorEnhanceLevel: "forte" });

    expect(res.status).toBe(200);
    expect(res.body.colorEnhanced).toBe(true);
    expect(res.body.colorEnhanceLevel).toBe("forte");
  });

  it("não marca colorEnhanced quando o tratamento confirmado não incluía enhance_color", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ previewUrl: "https://example.com/preview.webp", previewKey: "products/x/preview.webp" });

    expect(res.status).toBe(200);
    expect(res.body.colorEnhanced).toBe(false);
    expect(res.body.colorEnhanceLevel).toBeNull();
  });

  it("preserva colorEnhanced=true de uma confirmação anterior quando o novo tratamento só mexe em nitidez", async () => {
    await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ previewUrl: "https://example.com/v1.webp", previewKey: "products/x/v1.webp", colorEnhanced: true, colorEnhanceLevel: "leve" });

    const second = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ previewUrl: "https://example.com/v2.webp", previewKey: "products/x/v2.webp" });

    expect(second.status).toBe(200);
    expect(second.body.colorEnhanced).toBe(true);
    expect(second.body.colorEnhanceLevel).toBe("leve");
  });
});

describe("POST /undo — restaura os metadados colorEnhanced junto com a imagem anterior", () => {
  it("volta colorEnhanced para o valor de antes do último tratamento confirmado", async () => {
    // v1: sem realce de cor
    await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ previewUrl: "https://example.com/v1.webp", previewKey: "products/x/v1.webp" });

    // v2: com realce de cor "medio"
    await request(app)
      .post(`/api/products/${productId}/images/${imageId}/treatment/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ previewUrl: "https://example.com/v2.webp", previewKey: "products/x/v2.webp", colorEnhanced: true, colorEnhanceLevel: "medio" });

    const undone = await request(app)
      .post(`/api/products/${productId}/images/${imageId}/undo`)
      .set("Authorization", `Bearer ${token}`);

    expect(undone.status).toBe(200);
    expect(undone.body.url).toBe("https://example.com/v1.webp");
    expect(undone.body.colorEnhanced).toBe(false);
    expect(undone.body.colorEnhanceLevel).toBeNull();
  });
});
