import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";

// Fase 1B etapa 9 — leituras de apoio pra tela admin: GET /listings/:productId
// (registro LOCAL do anúncio, nunca chama a API do Mercado Livre) e
// GET /pendencias (agregador pro painel "Pendências").
const app = createApp();
const auth = { Authorization: `Bearer ${generateTestToken({ sub: "admin-ml-reads-test" })}` };

async function createProduct(sku?: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prisma.product.create({
    data: {
      name: "Turmalina Rubelita",
      slug: `turmalina-rubelita-${suffix}`,
      sku: sku ?? `RUB-${suffix}`,
      price: 600,
      active: true,
      trackStock: false,
      weightGrams: 150,
      sizeCm: 6,
    },
  });
}

async function createAccount() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prisma.mercadoLivreAccount.create({
    data: {
      mlUserId: `ml-user-${suffix}`,
      nickname: "LOJA_TESTE",
      accessToken: "ciphertext-fake-access",
      refreshToken: "ciphertext-fake-refresh",
      expiresAt: new Date(Date.now() + 3_600_000),
      scope: "offline_access read write",
    },
  });
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("GET /api/admin/mercadolivre/listings/:productId", () => {
  it("sem conta conectada: listing null", async () => {
    const product = await createProduct();
    const res = await request(app).get(`/api/admin/mercadolivre/listings/${product.id}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ listing: null });
  });

  it("com conta mas sem anúncio pra esta peça: listing null", async () => {
    await createAccount();
    const product = await createProduct();
    const res = await request(app).get(`/api/admin/mercadolivre/listings/${product.id}`).set(auth);
    expect(res.body).toEqual({ listing: null });
  });

  it("devolve o registro local sem chamar nenhuma API externa", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await prisma.mercadoLivreListing.create({
      data: { accountId: account.id, productId: product.id, status: "active", mlItemId: "ML-1", permalink: "https://x" },
    });

    const res = await request(app).get(`/api/admin/mercadolivre/listings/${product.id}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.listing.id).toBe(listing.id);
    expect(res.body.listing.status).toBe("active");
    expect(res.body.listing.mlItemId).toBe("ML-1");
  });

  it("sem token: 401", async () => {
    const res = await request(app).get("/api/admin/mercadolivre/listings/qualquer-id");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/mercadolivre/pendencias", () => {
  it("sem conta conectada: listas de listing vazias, webhook events seguem independentes da conta", async () => {
    await prisma.mercadoLivreWebhookEvent.create({ data: { bodyHash: "hash-err-1", lastError: "falha simulada" } });

    const res = await request(app).get("/api/admin/mercadolivre/pendencias").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.pausePending).toEqual([]);
    expect(res.body.stuckPublishing).toEqual([]);
    expect(res.body.webhookErrors).toHaveLength(1);
  });

  it("agrega pausa pendente, anúncio preso em publishing, erros e avisos de webhook", async () => {
    const account = await createAccount();
    const productPausePending = await createProduct();
    const productStuck = await createProduct();
    const productOk = await createProduct();

    await prisma.mercadoLivreListing.create({
      data: {
        accountId: account.id,
        productId: productPausePending.id,
        status: "active",
        mlItemId: "ML-PP-1",
        lastError: "pause_pending: falha ao pausar",
      },
    });
    await prisma.mercadoLivreListing.create({
      data: { accountId: account.id, productId: productStuck.id, status: "publishing" },
    });
    await prisma.mercadoLivreListing.create({
      data: { accountId: account.id, productId: productOk.id, status: "active", mlItemId: "ML-OK-1" },
    });

    await prisma.mercadoLivreWebhookEvent.create({
      data: { bodyHash: "hash-err-2", lastError: "Pedido pago — SKU não encontrado" },
    });
    await prisma.mercadoLivreWebhookEvent.create({
      data: { bodyHash: "hash-note-1", note: "Pedido 123 cancelado — revisão manual necessária" },
    });

    const res = await request(app).get("/api/admin/mercadolivre/pendencias").set(auth);

    expect(res.status).toBe(200);
    expect(res.body.pausePending).toHaveLength(1);
    expect(res.body.pausePending[0].productId).toBe(productPausePending.id);
    expect(res.body.stuckPublishing).toHaveLength(1);
    expect(res.body.stuckPublishing[0].productId).toBe(productStuck.id);
    expect(res.body.webhookErrors).toHaveLength(1);
    expect(res.body.webhookNotes).toHaveLength(1);
    expect(res.body.webhookNotes[0].note).toMatch(/cancelado/);
  });

  it("sem token: 401", async () => {
    const res = await request(app).get("/api/admin/mercadolivre/pendencias");
    expect(res.status).toBe(401);
  });
});
