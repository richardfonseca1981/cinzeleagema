import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import "./setup";

// Mocka a Claude API e o R2 — o resto (zod, rotas, Sharp para detectar o
// media type) roda de verdade.
vi.mock("../src/lib/claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/claude")>();
  return { ...actual, generateProductIdentification: vi.fn() };
});
vi.mock("../src/lib/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/r2")>();
  return { ...actual, isR2Configured: vi.fn(() => true), getObject: vi.fn() };
});

import { createApp } from "../src/app";
import { env } from "../src/lib/env";
import { HttpError } from "../src/middleware/errorHandler";
import { prisma } from "../src/lib/prisma";
import { generateProductIdentification } from "../src/lib/claude";
import * as r2 from "../src/lib/r2";
import { cleanDatabase, generateTestToken } from "./helpers";

const mockedGenerate = vi.mocked(generateProductIdentification);
const mockedGetObject = vi.mocked(r2.getObject);
const mockedIsR2Configured = vi.mocked(r2.isR2Configured);

// O setup padrão zera ANTHROPIC_API_KEY (nenhum teste chama a API real). A
// geração em si é mockada, mas a rota ainda checa "IA configurada" primeiro.
env.ANTHROPIC_API_KEY = "chave-falsa-de-teste";

const app = createApp();
const token = generateTestToken();

async function makeTestImage(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 80, g: 140, b: 90 } } })
    .jpeg()
    .toBuffer();
}

const VALID_PROPOSAL = {
  identificationPt: "Ágata Azul (Tingida)",
  identificationEn: "Dyed Blue Agate",
  confidence: "ALTA",
  treatment: "TINGIDA",
  note: "Confirmado por cor atípica à espécie",
};

let categoryId: string;
let productId: string;

beforeEach(async () => {
  await cleanDatabase();
  mockedGenerate.mockReset();
  mockedGetObject.mockReset();
  mockedIsR2Configured.mockReset().mockReturnValue(true);

  const category = await prisma.category.create({ data: { name: "Pedras Polidas", slug: "pedras-polidas" } });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { name: "Peça de teste", slug: `peca-teste-${Date.now()}`, price: 100, categoryId },
  });
  productId = product.id;

  mockedGetObject.mockResolvedValue(await makeTestImage());
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

async function addImage() {
  return prisma.productImage.create({
    data: { productId, url: "https://example.com/original.jpg", key: "products/x/original.jpg", position: 0 },
  });
}

describe("GET /api/admin/products/:id/identification", () => {
  it("rejeita sem token", async () => {
    const res = await request(app).get(`/api/admin/products/${productId}/identification`);
    expect(res.status).toBe(401);
  });

  it("devolve tudo null quando a peça nunca teve identificação gerada", async () => {
    const res = await request(app)
      .get(`/api/admin/products/${productId}/identification`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ identificationPt: null, identificationEn: null, confidence: null, treatment: null, note: null });
  });

  it("404 para peça inexistente", async () => {
    const res = await request(app)
      .get(`/api/admin/products/id-que-nao-existe/identification`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/products/:id/identification/generate", () => {
  it("rejeita sem token", async () => {
    const res = await request(app).post(`/api/admin/products/${productId}/identification/generate`);
    expect(res.status).toBe(401);
  });

  it("erro claro quando a peça não tem fotos", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/identification/generate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/não tem fotos/);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("503 amigável quando ANTHROPIC_API_KEY está ausente, sem chamar a IA", async () => {
    await addImage();
    const originalKey = env.ANTHROPIC_API_KEY;
    env.ANTHROPIC_API_KEY = "";
    try {
      const res = await request(app)
        .post(`/api/admin/products/${productId}/identification/generate`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/ANTHROPIC_API_KEY/);
      expect(mockedGenerate).not.toHaveBeenCalled();
    } finally {
      env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it("503 amigável quando a chamada à IA falha", async () => {
    await addImage();
    mockedGenerate.mockRejectedValue(new HttpError(503, "Serviço de IA indisponível, tente novamente"));

    const res = await request(app)
      .post(`/api/admin/products/${productId}/identification/generate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(503);
  });

  it("503 quando a resposta da IA não valida contra a lista fechada (resposta inválida tratada, não 500 cru)", async () => {
    await addImage();
    mockedGenerate.mockResolvedValue({
      identificationPt: "Ok",
      identificationEn: "Ok",
      confidence: "ALTÍSSIMA", // fora do enum fechado
      treatment: "TINGIDA",
    });

    const res = await request(app)
      .post(`/api/admin/products/${productId}/identification/generate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(503);
  });

  it("gera a proposta a partir de até 4 fotos (as primeiras por posição) e não grava nada no produto", async () => {
    for (let i = 0; i < 6; i++) {
      await prisma.productImage.create({
        data: { productId, url: `https://example.com/${i}.jpg`, key: `products/x/${i}.jpg`, position: i },
      });
    }
    mockedGenerate.mockResolvedValue(VALID_PROPOSAL);

    const res = await request(app)
      .post(`/api/admin/products/${productId}/identification/generate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(VALID_PROPOSAL);
    expect(mockedGenerate.mock.calls[0][0]).toHaveLength(4);

    const unchanged = await prisma.product.findUnique({ where: { id: productId } });
    expect(unchanged?.identificationPt).toBeNull();
  });
});

describe("PUT /api/admin/products/:id/identification", () => {
  it("rejeita sem token", async () => {
    const res = await request(app).put(`/api/admin/products/${productId}/identification`).send(VALID_PROPOSAL);
    expect(res.status).toBe(401);
  });

  it("grava os campos revisados pelo admin", async () => {
    const res = await request(app)
      .put(`/api/admin/products/${productId}/identification`)
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_PROPOSAL);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(VALID_PROPOSAL);

    const saved = await prisma.product.findUnique({ where: { id: productId } });
    expect(saved?.identificationPt).toBe(VALID_PROPOSAL.identificationPt);
    expect(saved?.identificationConfidence).toBe("ALTA");
    expect(saved?.identificationTreatment).toBe("TINGIDA");
    expect(saved?.identificationNote).toBe(VALID_PROPOSAL.note);
  });

  it("aceita limpar todos os campos (null)", async () => {
    await request(app)
      .put(`/api/admin/products/${productId}/identification`)
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_PROPOSAL);

    const cleared = { identificationPt: null, identificationEn: null, confidence: null, treatment: null, note: null };
    const res = await request(app)
      .put(`/api/admin/products/${productId}/identification`)
      .set("Authorization", `Bearer ${token}`)
      .send(cleared);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cleared);

    const saved = await prisma.product.findUnique({ where: { id: productId } });
    expect(saved?.identificationPt).toBeNull();
    expect(saved?.identificationConfidence).toBeNull();
  });

  it("rejeita confidence/treatment fora da lista fechada", async () => {
    const res = await request(app)
      .put(`/api/admin/products/${productId}/identification`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID_PROPOSAL, confidence: "ALTISSIMA" });

    expect(res.status).toBe(400);
  });

  it("404 para peça inexistente", async () => {
    const res = await request(app)
      .put(`/api/admin/products/id-que-nao-existe/identification`)
      .set("Authorization", `Bearer ${token}`)
      .send(VALID_PROPOSAL);
    expect(res.status).toBe(404);
  });
});
