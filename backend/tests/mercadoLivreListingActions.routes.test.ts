import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";
import { env } from "../src/lib/env";
import { FakeMercadoLivrePublisherClient } from "../src/lib/mercadoLivre/publisherClient";
import { setMercadoLivrePublisherClientForTests } from "../src/lib/mercadoLivre/publisherClientRegistry";

// Fase 1B etapa 6 — pausar/reativar/encerrar/sincronizar um anúncio JÁ
// publicado. Diferente das rotas de publicação (Etapa 5), estas NUNCA
// remontam o payload (não chamam buildMercadoLivreItemPayload) — só leem/
// gravam a linha de MercadoLivreListing e chamam o publisher client, então
// não precisam da categoria "confirmada" nem de ML_LISTING_TYPE_ID.
const app = createApp();
const auth = { Authorization: `Bearer ${generateTestToken({ sub: "admin-ml-listing-actions-test" })}` };

const originalPublishEnabled = env.ML_PUBLISH_ENABLED;

let fakeClient: FakeMercadoLivrePublisherClient;

async function createProduct(sku?: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prisma.product.create({
    data: {
      name: "Ametista Geodo Grande",
      slug: `ametista-geodo-${suffix}`,
      sku: sku ?? `AME-${suffix}`,
      price: 900,
      active: true,
      trackStock: false,
      weightGrams: 2000,
      sizeCm: 30,
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

// Cria a linha local de MercadoLivreListing E o item correspondente no fake
// client (quando mlItemId informado) — as duas fontes de status são
// independentes de propósito: o status local é o que as rotas de ação leem
// pra decidir a transição; o status do fake é só usado pela rota de sync
// (simula o que está "no Mercado Livre agora").
async function seedListing(
  accountId: string,
  productId: string,
  options: { status: string; mlItemId?: string | null; mlSideStatus?: "active" | "paused" | "closed" }
) {
  const mlItemId = options.mlItemId === undefined ? `FAKE-ITEM-${productId}` : options.mlItemId;
  if (mlItemId) {
    fakeClient.items.set(mlItemId, {
      id: mlItemId,
      permalink: `https://produto.mercadolivre.com.br/${mlItemId}`,
      status: options.mlSideStatus ?? "active",
      sellerCustomField: null,
      description: "",
    });
  }
  return prisma.mercadoLivreListing.create({
    data: { accountId, productId, status: options.status, mlItemId: mlItemId ?? null },
  });
}

beforeEach(async () => {
  await cleanDatabase();
  fakeClient = new FakeMercadoLivrePublisherClient();
  setMercadoLivrePublisherClientForTests(fakeClient);
});

afterEach(() => {
  env.ML_PUBLISH_ENABLED = originalPublishEnabled;
  setMercadoLivrePublisherClientForTests(null);
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("POST /listings/:productId/pause", () => {
  it("active -> paused: sucesso, atualiza status local e chama o publisher client", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, { status: "active" });

    const updateSpy = vi.spyOn(fakeClient, "updateItemStatus");
    const res = await request(app).post(`/api/admin/mercadolivre/listings/${product.id}/pause`).set(auth).send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paused");
    expect(updateSpy).toHaveBeenCalledWith(account.id, listing.mlItemId, "paused");

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("paused");
    expect(row.lastSyncAt).not.toBeNull();
  });

  it("ML_PUBLISH_ENABLED=false NÃO bloqueia pausar (ação de segurança)", async () => {
    env.ML_PUBLISH_ENABLED = false;
    const account = await createAccount();
    const product = await createProduct();
    await seedListing(account.id, product.id, { status: "active" });

    const res = await request(app).post(`/api/admin/mercadolivre/listings/${product.id}/pause`).set(auth).send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paused");
  });

  it.each([
    ["paused", "invalid_transition"],
    ["closed", "already_closed"],
    ["publishing", "needs_reconciliation"],
    ["error", "needs_reconciliation"],
  ])("bloqueia pausar a partir de \"%s\" (409, motivo %s)", async (status) => {
    const account = await createAccount();
    const product = await createProduct();
    await seedListing(account.id, product.id, { status });

    const res = await request(app).post(`/api/admin/mercadolivre/listings/${product.id}/pause`).set(auth).send({});
    expect(res.status).toBe(409);
  });

  it("sem conta conectada: 503", async () => {
    const product = await createProduct();
    const res = await request(app).post(`/api/admin/mercadolivre/listings/${product.id}/pause`).set(auth).send({});
    expect(res.status).toBe(503);
  });

  it("falha da API: mantém status anterior (active), grava lastError, 502", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, { status: "active" });
    fakeClient.queueFailure("updateItemStatus", { type: "server_error" });

    const res = await request(app).post(`/api/admin/mercadolivre/listings/${product.id}/pause`).set(auth).send({});

    expect(res.status).toBe(502);
    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("active");
    expect(row.lastError).toBeTruthy();
  });
});

describe("POST /listings/:productId/reactivate", () => {
  it("paused -> active: sucesso quando a flag está ligada", async () => {
    env.ML_PUBLISH_ENABLED = true;
    const account = await createAccount();
    const product = await createProduct();
    await seedListing(account.id, product.id, { status: "paused" });

    const res = await request(app).post(`/api/admin/mercadolivre/listings/${product.id}/reactivate`).set(auth).send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
  });

  it("ML_PUBLISH_ENABLED=false BLOQUEIA reativar: forcedDryRun, status local inalterado, sem chamar a API", async () => {
    env.ML_PUBLISH_ENABLED = false;
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, { status: "paused" });

    const updateSpy = vi.spyOn(fakeClient, "updateItemStatus");
    const res = await request(app).post(`/api/admin/mercadolivre/listings/${product.id}/reactivate`).set(auth).send({});

    expect(res.status).toBe(200);
    expect(res.body.forcedDryRun).toBe(true);
    expect(updateSpy).not.toHaveBeenCalled();

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("paused");
  });

  it("bloqueia reativar a partir de \"active\" (409 invalid_transition)", async () => {
    env.ML_PUBLISH_ENABLED = true;
    const account = await createAccount();
    const product = await createProduct();
    await seedListing(account.id, product.id, { status: "active" });

    const res = await request(app).post(`/api/admin/mercadolivre/listings/${product.id}/reactivate`).set(auth).send({});
    expect(res.status).toBe(409);
  });
});

describe("POST /listings/:productId/close", () => {
  it("rejeita sem confirm (400)", async () => {
    const account = await createAccount();
    const product = await createProduct();
    await seedListing(account.id, product.id, { status: "active" });

    const res = await request(app).post(`/api/admin/mercadolivre/listings/${product.id}/close`).set(auth).send({});
    expect(res.status).toBe(400);
  });

  it("rejeita com confirm incorreto (400)", async () => {
    const account = await createAccount();
    const product = await createProduct();
    await seedListing(account.id, product.id, { status: "active" });

    const res = await request(app)
      .post(`/api/admin/mercadolivre/listings/${product.id}/close`)
      .set(auth)
      .send({ confirm: "encerrar" });
    expect(res.status).toBe(400);
  });

  it.each(["active", "paused"])("com confirm correto, encerra a partir de \"%s\" (ação de segurança, flag off não bloqueia)", async (status) => {
    env.ML_PUBLISH_ENABLED = false;
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, { status });

    const res = await request(app)
      .post(`/api/admin/mercadolivre/listings/${product.id}/close`)
      .set(auth)
      .send({ confirm: "ENCERRAR" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("closed");

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("closed");
  });

  it("closed é terminal: um segundo encerramento é bloqueado (409)", async () => {
    const account = await createAccount();
    const product = await createProduct();
    await seedListing(account.id, product.id, { status: "closed" });

    const res = await request(app)
      .post(`/api/admin/mercadolivre/listings/${product.id}/close`)
      .set(auth)
      .send({ confirm: "ENCERRAR" });
    expect(res.status).toBe(409);
  });
});

describe("POST /listings/pause-all", () => {
  it("rejeita sem a confirmação exata (400)", async () => {
    const res = await request(app).post("/api/admin/mercadolivre/listings/pause-all").set(auth).send({ confirm: "pausar tudo" });
    expect(res.status).toBe(400);
  });

  it("pausa todos os anúncios ativos, continua em falha parcial e devolve resumo ok/erro", async () => {
    const account = await createAccount();
    const productOk = await createProduct();
    const productFail = await createProduct();
    const productPausedAlready = await createProduct();

    const listingOk = await seedListing(account.id, productOk.id, { status: "active" });
    const listingFail = await seedListing(account.id, productFail.id, { status: "active" });
    await seedListing(account.id, productPausedAlready.id, { status: "paused" });

    // Só a 2ª chamada a updateItemStatus (no loop, ordem de criação) falha —
    // a 1ª e qualquer uma depois continuam normais.
    let call = 0;
    vi.spyOn(fakeClient, "updateItemStatus").mockImplementation(async (accountId, mlItemId, status) => {
      call += 1;
      if (call === 2) throw new Error("falha simulada");
      const item = fakeClient.items.get(mlItemId);
      if (item) item.status = status;
    });

    const res = await request(app)
      .post("/api/admin/mercadolivre/listings/pause-all")
      .set(auth)
      .send({ confirm: "PAUSAR TUDO" });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2); // só os que estavam "active"
    expect(res.body.succeeded).toBe(1);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results.some((r: { ok: boolean }) => r.ok)).toBe(true);
    expect(res.body.results.some((r: { ok: boolean }) => !r.ok)).toBe(true);

    const rowOk = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listingOk.id } });
    const rowFail = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listingFail.id } });
    // Qualquer um dos dois pode ter sido o que falhou — confirma que
    // exatamente um ficou "paused" e o outro manteve "active" com lastError.
    const statuses = [rowOk.status, rowFail.status].sort();
    expect(statuses).toEqual(["active", "paused"]);
    const failedRow = rowOk.status === "active" ? rowOk : rowFail;
    expect(failedRow.lastError).toBe("falha simulada");
  });
});

describe("GET/POST /listings/:productId/sync", () => {
  it("lê o status atual no Mercado Livre e atualiza a linha local (ex.: pausado direto no painel do ML)", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, { status: "active", mlSideStatus: "active" });

    // Simula alguém pausando direto no painel do Mercado Livre, sem passar
    // por nenhuma rota deste admin.
    fakeClient.items.get(listing.mlItemId!)!.status = "paused";

    const res = await request(app).get(`/api/admin/mercadolivre/listings/${product.id}/sync`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paused");
    expect(res.body.synced).toBe(true);

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("paused");
    expect(row.lastSyncAt).not.toBeNull();
  });

  it("funciona via POST também", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, { status: "paused", mlSideStatus: "active" });

    const res = await request(app).post(`/api/admin/mercadolivre/listings/${product.id}/sync`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("active");
  });

  it("falha na leitura: mantém o status local anterior, grava lastError, 502", async () => {
    const account = await createAccount();
    const product = await createProduct();
    const listing = await seedListing(account.id, product.id, { status: "active" });
    fakeClient.queueFailure("getItem", { type: "server_error" });

    const res = await request(app).get(`/api/admin/mercadolivre/listings/${product.id}/sync`).set(auth);

    expect(res.status).toBe(502);
    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("active");
    expect(row.lastError).toBeTruthy();
  });

  it("anúncio sem mlItemId: 422", async () => {
    const account = await createAccount();
    const product = await createProduct();
    await seedListing(account.id, product.id, { status: "publishing", mlItemId: null });

    const res = await request(app).get(`/api/admin/mercadolivre/listings/${product.id}/sync`).set(auth);
    expect(res.status).toBe(422);
  });
});
