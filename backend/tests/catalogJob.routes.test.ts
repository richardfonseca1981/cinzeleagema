import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import fs from "fs";
import "./setup";

vi.mock("../src/lib/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/r2")>();
  return { ...actual, isR2Configured: vi.fn(() => true), getObject: vi.fn() };
});

vi.mock("../src/lib/exchangeRate", () => ({
  getExchangeRate: vi.fn(async () => ({ rate: 5, updatedAt: new Date("2026-10-31T12:00:00Z"), source: "live" as const })),
}));

import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import * as r2 from "../src/lib/r2";
import { cleanDatabase, generateTestToken } from "./helpers";
import { __resetCatalogJobsForTests, getCatalogJobFile } from "../src/lib/catalog/catalogJobs";

const app = createApp();
const token = generateTestToken();
const auth = { Authorization: `Bearer ${token}` };
const CATALOG_PATH = "/api/admin/catalog";

const mockedGetObject = vi.mocked(r2.getObject);

const syntheticJpeg = () =>
  sharp({ create: { width: 300, height: 400, channels: 3, background: { r: 90, g: 120, b: 150 } } })
    .jpeg()
    .toBuffer();

async function createProduct(data: { name: string; sku: string; price: number | null; categoryId?: string; withPhoto?: boolean }) {
  const product = await prisma.product.create({
    data: {
      name: data.name,
      slug: data.name.toLowerCase().replace(/\s+/g, "-"),
      sku: data.sku,
      price: data.price,
      active: true,
      categoryId: data.categoryId ?? null,
    },
  });
  if (data.withPhoto !== false) {
    await prisma.productImage.create({
      data: { productId: product.id, url: `https://cdn.test/${product.id}.jpg`, key: `products/${product.id}/cover.jpg`, position: 0 },
    });
  }
  return product;
}

async function waitForJobDone(id: string, timeoutMs = 5000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request(app).get(`${CATALOG_PATH}/jobs/${id}`).set(auth);
    if (res.body.status === "done" || res.body.status === "error") return res.body;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`job ${id} did not finish within ${timeoutMs}ms`);
}

beforeEach(async () => {
  await cleanDatabase();
  __resetCatalogJobsForTests();
  mockedGetObject.mockReset();
  mockedGetObject.mockImplementation(async () => syntheticJpeg());
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

const VALID_BODY = {
  language: "pt" as const,
  showPrice: true,
  showRef: true,
  includeContactPage: true,
  quality: "standard" as const,
};

describe("POST /api/admin/catalog/jobs", () => {
  it("rejeita sem token (401)", async () => {
    const res = await request(app).post(`${CATALOG_PATH}/jobs`).send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  it("valida o corpo (400 para idioma/qualidade fora da lista)", async () => {
    const res = await request(app).post(`${CATALOG_PATH}/jobs`).set(auth).send({ ...VALID_BODY, language: "fr" });
    expect(res.status).toBe(400);

    const res2 = await request(app).post(`${CATALOG_PATH}/jobs`).set(auth).send({ ...VALID_BODY, quality: "ultra" });
    expect(res2.status).toBe(400);
  });

  it("campos obrigatórios ausentes são 400", async () => {
    const res = await request(app).post(`${CATALOG_PATH}/jobs`).set(auth).send({ language: "pt" });
    expect(res.status).toBe(400);
  });

  it("retorna 202 com o id na hora, mesmo com a geração ainda rodando", async () => {
    await createProduct({ name: "Peça A", sku: "A-1", price: 10 });
    const res = await request(app).post(`${CATALOG_PATH}/jobs`).set(auth).send(VALID_BODY);
    expect(res.status).toBe(202);
    expect(typeof res.body.id).toBe("string");
    await waitForJobDone(res.body.id);
  });

  it("409 com mensagem clara quando já existe uma geração em andamento", async () => {
    await createProduct({ name: "Peça A", sku: "A-1", price: 10 });

    let releaseFirstFetch: (() => void) | null = null;
    const realBuffer = await syntheticJpeg();
    mockedGetObject.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFirstFetch = () => resolve(realBuffer);
        })
    );

    const first = await request(app).post(`${CATALOG_PATH}/jobs`).set(auth).send(VALID_BODY);
    expect(first.status).toBe(202);

    const second = await request(app).post(`${CATALOG_PATH}/jobs`).set(auth).send(VALID_BODY);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/andamento/i);

    // Libera a primeira geração e espera terminar, para não vazar job "running" entre testes.
    releaseFirstFetch?.();
    await waitForJobDone(first.body.id);
  });

  it("productIds vazio/omitido inclui todas as peças ativas", async () => {
    await createProduct({ name: "Peça A", sku: "A-1", price: 10 });
    await createProduct({ name: "Peça B", sku: "B-1", price: 10 });

    const res = await request(app).post(`${CATALOG_PATH}/jobs`).set(auth).send({ ...VALID_BODY, productIds: [] });
    const status = await waitForJobDone(res.body.id);
    expect(status.pageCount).toBe(4); // capa + 2 peças + contato
  });
});

describe("GET /api/admin/catalog/jobs/:id", () => {
  it("rejeita sem token (401)", async () => {
    const res = await request(app).get(`${CATALOG_PATH}/jobs/qualquer-id`);
    expect(res.status).toBe(401);
  });

  it("404 para job inexistente", async () => {
    const res = await request(app).get(`${CATALOG_PATH}/jobs/nao-existe`).set(auth);
    expect(res.status).toBe(404);
  });

  it("ciclo completo: queued/running -> done, com progresso, avisos e cotação", async () => {
    const placeholder = await createProduct({ name: "Pedra 4875 - Peso", sku: "P-1", price: 1 });
    await createProduct({ name: "Esmeralda", sku: "E-1", price: 500 });

    const created = await request(app).post(`${CATALOG_PATH}/jobs`).set(auth).send({ ...VALID_BODY, language: "en" });
    expect(created.status).toBe(202);

    const firstStatus = await request(app).get(`${CATALOG_PATH}/jobs/${created.body.id}`).set(auth);
    expect(["queued", "running", "done"]).toContain(firstStatus.body.status);

    const done = await waitForJobDone(created.body.id);
    expect(done.status).toBe("done");
    expect(done.pageCount).toBe(4); // capa + 2 peças + contato
    expect(done.progress).toEqual({ done: 2, total: 2 });
    expect(done.sizeBytes).toBeGreaterThan(0);
    expect(done.rateSource).toBe("live");
    expect(done.rateUpdatedAt).toBe("2026-10-31T12:00:00.000Z");
    expect(done.warnings).toContainEqual(
      expect.objectContaining({ id: placeholder.id, reason: "Nome provisório (padrão de importação em lote)" })
    );
    expect(done.skipped).toEqual([]);
  });
});

describe("GET /api/admin/catalog/jobs/:id/download", () => {
  it("rejeita sem token (401)", async () => {
    const res = await request(app).get(`${CATALOG_PATH}/jobs/qualquer-id/download`);
    expect(res.status).toBe(401);
  });

  it("404 para job inexistente", async () => {
    const res = await request(app).get(`${CATALOG_PATH}/jobs/nao-existe/download`).set(auth);
    expect(res.status).toBe(404);
  });

  it("409 quando o job ainda não terminou", async () => {
    await createProduct({ name: "Peça A", sku: "A-1", price: 10 });
    let release: (() => void) | null = null;
    const realBuffer = await syntheticJpeg();
    mockedGetObject.mockImplementation(() => new Promise((resolve) => (release = () => resolve(realBuffer))));

    const created = await request(app).post(`${CATALOG_PATH}/jobs`).set(auth).send(VALID_BODY);
    const res = await request(app).get(`${CATALOG_PATH}/jobs/${created.body.id}/download`).set(auth);
    expect(res.status).toBe(409);

    release?.();
    await waitForJobDone(created.body.id);
  });

  it("baixa o PDF já pronto com o Content-Disposition certo", async () => {
    await createProduct({ name: "Peça A", sku: "A-1", price: 10 });
    const created = await request(app).post(`${CATALOG_PATH}/jobs`).set(auth).send(VALID_BODY);
    await waitForJobDone(created.body.id);

    const res = await request(app)
      .get(`${CATALOG_PATH}/jobs/${created.body.id}/download`)
      .set(auth)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toMatch(/catalogo-cinzel-pt-\d{4}-\d{2}-\d{2}\.pdf/);
    expect((res.body as Buffer).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("TTL / limpeza", () => {
  it("job expirado some do status e o arquivo temporário é removido do disco", async () => {
    await createProduct({ name: "Peça A", sku: "A-1", price: 10 });
    const created = await request(app).post(`${CATALOG_PATH}/jobs`).set(auth).send(VALID_BODY);
    await waitForJobDone(created.body.id);

    const file = getCatalogJobFile(created.body.id);
    expect(file).not.toBeNull();
    expect(fs.existsSync(file!.filePath)).toBe(true);

    // Simula o TTL vencendo (30 min reais não cabem num teste) chamando a
    // mesma limpeza que o timer real dispara.
    const { __forceExpireCatalogJobForTests } = await import("../src/lib/catalog/catalogJobs");
    await __forceExpireCatalogJobForTests(created.body.id);

    const res = await request(app).get(`${CATALOG_PATH}/jobs/${created.body.id}`).set(auth);
    expect(res.status).toBe(404);
    expect(fs.existsSync(file!.filePath)).toBe(false);
  });
});

describe("GET /api/admin/catalog/options", () => {
  it("rejeita sem token (401)", async () => {
    const res = await request(app).get(`${CATALOG_PATH}/options`);
    expect(res.status).toBe(401);
  });

  it("só lista categorias com pelo menos uma peça ativa", async () => {
    const withPieces = await prisma.category.create({ data: { name: "Com Peças", slug: "com-pecas" } });
    await prisma.category.create({ data: { name: "Vazia", slug: "vazia" } });
    await createProduct({ name: "Peça A", sku: "A-1", price: 10, categoryId: withPieces.id });
    await createProduct({ name: "Peça Inativa", sku: "A-2", price: 10, categoryId: withPieces.id });
    await prisma.product.update({ where: { sku: "A-2" }, data: { active: false } });

    const res = await request(app).get(`${CATALOG_PATH}/options`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual([{ id: withPieces.id, name: "Com Peças", count: 1 }]);
  });
});
