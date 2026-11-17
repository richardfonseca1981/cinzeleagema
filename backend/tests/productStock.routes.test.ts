import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";
import { FakeMercadoLivrePublisherClient } from "../src/lib/mercadoLivre/publisherClient";
import { setMercadoLivrePublisherClientForTests } from "../src/lib/mercadoLivre/publisherClientRegistry";

// Fase 1B etapa 7 — marcar/desmarcar peça vendida e o aviso de
// /:id/deactivate. Pausar/encerrar são ações de SEGURANÇA (ver Etapa 6) —
// NUNCA bloqueadas por ML_PUBLISH_ENABLED, então estes testes nunca
// precisam mexer nessa flag.
const app = createApp();
const auth = { Authorization: `Bearer ${generateTestToken({ sub: "admin-stock-test" })}` };

let fakeClient: FakeMercadoLivrePublisherClient;

async function createProduct(sku?: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prisma.product.create({
    data: {
      name: "Quartzo Rosa Polido",
      slug: `quartzo-rosa-${suffix}`,
      sku: sku ?? `QRZ-${suffix}`,
      price: 150,
      active: true,
      trackStock: false,
      weightGrams: 300,
      sizeCm: 10,
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

async function seedListing(accountId: string, productId: string, status: string, mlItemId: string | null = `FAKE-ITEM-${productId}`) {
  if (mlItemId) {
    fakeClient.items.set(mlItemId, {
      id: mlItemId,
      permalink: `https://produto.mercadolivre.com.br/${mlItemId}`,
      status: "active",
      sellerCustomField: null,
      description: "",
    });
  }
  return prisma.mercadoLivreListing.create({ data: { accountId, productId, status, mlItemId } });
}

beforeEach(async () => {
  await cleanDatabase();
  fakeClient = new FakeMercadoLivrePublisherClient();
  setMercadoLivrePublisherClientForTests(fakeClient);
});

afterEach(() => {
  setMercadoLivrePublisherClientForTests(null);
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("POST /api/admin/products/:id/mark-sold", () => {
  it("rejeita sem confirm:true ou sem channel válido (400)", async () => {
    const product = await createProduct();
    const res1 = await request(app).post(`/api/admin/products/${product.id}/mark-sold`).set(auth).send({ channel: "site" });
    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .post(`/api/admin/products/${product.id}/mark-sold`)
      .set(auth)
      .send({ channel: "loja-fisica", confirm: true });
    expect(res2.status).toBe(400);
  });

  it("sem conta/anúncio ML: marca vendida e desativa, mlListing null", async () => {
    const product = await createProduct();

    const res = await request(app)
      .post(`/api/admin/products/${product.id}/mark-sold`)
      .set(auth)
      .send({ channel: "site", confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect(res.body.soldChannel).toBe("site");
    expect(res.body.soldAt).toBeTruthy();
    expect(res.body.mlListing).toBeNull();
  });

  it("anúncio ML active, canal site: pausa o anúncio (200)", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, "active");

    const updateSpy = vi.spyOn(fakeClient, "updateItemStatus");
    const res = await request(app)
      .post(`/api/admin/products/${product.id}/mark-sold`)
      .set(auth)
      .send({ channel: "site", confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.mlListing.status).toBe("paused");
    expect(updateSpy).toHaveBeenCalledWith(account.id, listing.mlItemId, "paused");

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("paused");
  });

  it("canal mercadolivre: NÃO tenta pausar, mesmo com anúncio active", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, "active");

    const updateSpy = vi.spyOn(fakeClient, "updateItemStatus");
    const res = await request(app)
      .post(`/api/admin/products/${product.id}/mark-sold`)
      .set(auth)
      .send({ channel: "mercadolivre", confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.soldChannel).toBe("mercadolivre");
    expect(res.body.mlListing.status).toBe("active");
    expect(updateSpy).not.toHaveBeenCalled();

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("active");
  });

  it("anúncio já paused: 200, sem tentar pausar de novo", async () => {
    const account = await createAccount();
    const product = await createProduct();
    await seedListing(account.id, product.id, "paused");

    const updateSpy = vi.spyOn(fakeClient, "updateItemStatus");
    const res = await request(app)
      .post(`/api/admin/products/${product.id}/mark-sold`)
      .set(auth)
      .send({ channel: "site", confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.mlListing.status).toBe("paused");
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("falha ao pausar: peça continua vendida (207), lastError com marca pause_pending, status local inalterado", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, "active");
    fakeClient.queueFailure("updateItemStatus", { type: "server_error" });

    const res = await request(app)
      .post(`/api/admin/products/${product.id}/mark-sold`)
      .set(auth)
      .send({ channel: "site", confirm: true });

    expect(res.status).toBe(207);
    expect(res.body.active).toBe(false); // continua marcada/vendida no site
    expect(res.body.warning).toBe("ml_pause_failed");

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("active"); // nunca assume que a pausa aplicou
    expect(row.lastError).toMatch(/^pause_pending:/);
  });

  it("idempotência: marcar vendida duas vezes não falha", async () => {
    const product = await createProduct();

    const res1 = await request(app)
      .post(`/api/admin/products/${product.id}/mark-sold`)
      .set(auth)
      .send({ channel: "site", confirm: true });
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post(`/api/admin/products/${product.id}/mark-sold`)
      .set(auth)
      .send({ channel: "other", confirm: true });
    expect(res2.status).toBe(200);
    expect(res2.body.soldChannel).toBe("other");
  });
});

describe("POST /api/admin/products/:id/unmark-sold", () => {
  it("desfaz: limpa soldAt/soldChannel, reativa no site, NUNCA mexe no anúncio ML", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, "paused");

    await request(app).post(`/api/admin/products/${product.id}/mark-sold`).set(auth).send({ channel: "site", confirm: true });

    const updateSpy = vi.spyOn(fakeClient, "updateItemStatus");
    const res = await request(app).post(`/api/admin/products/${product.id}/unmark-sold`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);
    expect(res.body.soldAt).toBeNull();
    expect(res.body.soldChannel).toBeNull();
    expect(updateSpy).not.toHaveBeenCalled();

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("paused"); // continua pausado — reativação é manual e separada
  });
});

describe("PATCH /api/products/:id/deactivate — aviso de anúncio ML", () => {
  it("sem anúncio: resposta sem mlListing/warning", async () => {
    const product = await createProduct();
    const res = await request(app).patch(`/api/products/${product.id}/deactivate`).set(auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.mlListing).toBeUndefined();
    expect(res.body.warning).toBeUndefined();
  });

  it("anúncio active, sem pauseMlListing: só avisa, NÃO pausa", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, "active");

    const updateSpy = vi.spyOn(fakeClient, "updateItemStatus");
    const res = await request(app).patch(`/api/products/${product.id}/deactivate`).set(auth).send({});

    expect(res.status).toBe(200);
    expect(res.body.warning).toBe("ml_listing_active");
    expect(res.body.mlListing.status).toBe("active");
    expect(updateSpy).not.toHaveBeenCalled();

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("active");
  });

  it("anúncio active, pauseMlListing:true: pausa na mesma chamada", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, "active");

    const res = await request(app).patch(`/api/products/${product.id}/deactivate`).set(auth).send({ pauseMlListing: true });

    expect(res.status).toBe(200);
    expect(res.body.mlListing.status).toBe("paused");
    expect(res.body.warning).toBeUndefined();

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("paused");
  });

  it("anúncio paused, pauseMlListing:true: nada a pausar, mantém o aviso (não tenta de novo)", async () => {
    const account = await createAccount();
    const product = await createProduct();
    await seedListing(account.id, product.id, "paused");

    const updateSpy = vi.spyOn(fakeClient, "updateItemStatus");
    const res = await request(app).patch(`/api/products/${product.id}/deactivate`).set(auth).send({ pauseMlListing: true });

    expect(res.status).toBe(200);
    expect(res.body.warning).toBe("ml_listing_active");
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("anúncio publishing: avisa (ml_listing_active), mesmo com pauseMlListing:true nunca tenta pausar", async () => {
    const account = await createAccount();
    const product = await createProduct();
    await seedListing(account.id, product.id, "publishing", null);

    const updateSpy = vi.spyOn(fakeClient, "updateItemStatus");
    const res = await request(app).patch(`/api/products/${product.id}/deactivate`).set(auth).send({ pauseMlListing: true });

    expect(res.status).toBe(200);
    expect(res.body.warning).toBe("ml_listing_active");
    expect(res.body.mlListing.status).toBe("publishing");
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("falha ao pausar com pauseMlListing:true: 207, mantém status local, lastError pause_pending", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, "active");
    fakeClient.queueFailure("updateItemStatus", { type: "server_error" });

    const res = await request(app).patch(`/api/products/${product.id}/deactivate`).set(auth).send({ pauseMlListing: true });

    expect(res.status).toBe(207);
    expect(res.body.warning).toBe("ml_pause_failed");
    expect(res.body.active).toBe(false); // continua desativada no site

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("active");
    expect(row.lastError).toMatch(/^pause_pending:/);
  });
});

describe("API pública exclui peça vendida/inativa", () => {
  it("GET /api/products?active=true não inclui a peça depois de mark-sold", async () => {
    const product = await createProduct();

    const before = await request(app).get("/api/products").query({ active: "true" });
    expect(before.body.items.some((p: { id: string }) => p.id === product.id)).toBe(true);

    await request(app).post(`/api/admin/products/${product.id}/mark-sold`).set(auth).send({ channel: "site", confirm: true });

    const after = await request(app).get("/api/products").query({ active: "true" });
    expect(after.body.items.some((p: { id: string }) => p.id === product.id)).toBe(false);
  });
});
