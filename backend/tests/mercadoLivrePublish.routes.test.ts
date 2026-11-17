import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";
import { env } from "../src/lib/env";
import { GEMSTONE_CATEGORY_FIXTURE } from "../src/lib/mercadoLivre/categoryFixture";
import { FakeMercadoLivrePublisherClient } from "../src/lib/mercadoLivre/publisherClient";
import { setMercadoLivrePublisherClientForTests } from "../src/lib/mercadoLivre/publisherClientRegistry";

// Fase 1B etapa 5 — rotas de publicação/reconciliação. A categoria do
// Mercado Livre nunca foi confirmada de verdade nesta fase (ver
// categoryFixture.ts, GEMSTONE_CATEGORY_FIXTURE.verified: false) — sem isso,
// buildMercadoLivreItemPayload SEMPRE bloquearia (category_not_verified),
// inclusive em dry-run, e nenhum destes testes conseguiria exercitar o fluxo
// de verdade. Igual à técnica já usada em publisherPayload.test.ts com
// env.ML_LISTING_TYPE_ID, viramos `verified: true` só durante esta suíte
// (restaurado no afterEach) — nunca muda o comportamento em produção.
const app = createApp();
const auth = { Authorization: `Bearer ${generateTestToken({ sub: "admin-ml-publish-test" })}` };

const originalListingTypeId = env.ML_LISTING_TYPE_ID;
const originalPublishEnabled = env.ML_PUBLISH_ENABLED;
const originalCategoryVerified = GEMSTONE_CATEGORY_FIXTURE.verified;
const originalCategoryId = GEMSTONE_CATEGORY_FIXTURE.id;

let fakeClient: FakeMercadoLivrePublisherClient;

async function createProduct(overrides: { price?: number | null; sku?: string } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const product = await prisma.product.create({
    data: {
      name: "Turmalina Paraíba Lapidada",
      slug: `turmalina-paraiba-${suffix}`,
      sku: overrides.sku ?? `TUR-${suffix}`,
      price: overrides.price === undefined ? 1200 : overrides.price,
      active: true,
      trackStock: false,
      weightGrams: 850,
      sizeCm: 23,
    },
  });
  await prisma.productImage.create({
    data: {
      productId: product.id,
      url: "https://cdn.test/tur-1.jpg",
      key: `products/${product.id}/1.jpg`,
      position: 0,
      width: 1080,
      height: 1920,
    },
  });
  return product;
}

async function createAccount(markupPct = 20) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prisma.mercadoLivreAccount.create({
    data: {
      mlUserId: `ml-user-${suffix}`,
      nickname: "LOJA_TESTE",
      accessToken: "ciphertext-fake-access",
      refreshToken: "ciphertext-fake-refresh",
      expiresAt: new Date(Date.now() + 3_600_000),
      scope: "offline_access read write",
      markupPct,
    },
  });
}

// price=1200, markup=20%, comissão/tarifa/frete padrão não verificados (ver
// priceCalculator.ts UNVERIFIED_DEFAULT_*): listingPrice = 1200*1.2 = 1440.
const EXPECTED_LISTING_PRICE = 1440;

beforeEach(async () => {
  await cleanDatabase();
  env.ML_LISTING_TYPE_ID = "gold_special";
  // assertReadyToPublish (listingBuilder.ts) bloqueia quando verified=false
  // OU quando id === ML_FIXME_CATEGORY_ID — as duas precisam mudar juntas
  // para simular uma categoria já confirmada nesta suíte.
  GEMSTONE_CATEGORY_FIXTURE.verified = true;
  GEMSTONE_CATEGORY_FIXTURE.id = "MLB-TEST-VERIFIED";

  fakeClient = new FakeMercadoLivrePublisherClient();
  setMercadoLivrePublisherClientForTests(fakeClient);
});

afterEach(() => {
  env.ML_LISTING_TYPE_ID = originalListingTypeId;
  env.ML_PUBLISH_ENABLED = originalPublishEnabled;
  GEMSTONE_CATEGORY_FIXTURE.verified = originalCategoryVerified;
  GEMSTONE_CATEGORY_FIXTURE.id = originalCategoryId;
  setMercadoLivrePublisherClientForTests(null);
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("POST /publish/:productId — dry-run", () => {
  it("com ML_PUBLISH_ENABLED=false, monta o payload, não grava nada e nunca chama o publisher client", async () => {
    env.ML_PUBLISH_ENABLED = false;
    const account = await createAccount();
    const product = await createProduct();

    const res = await request(app)
      .post(`/api/admin/mercadolivre/publish/${product.id}`)
      .set(auth)
      .send({ mode: "real", expectedPrice: EXPECTED_LISTING_PRICE, confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("dry-run");
    expect(res.body.forcedDryRun).toBe(true);
    expect(res.body.payload.price).toBe(EXPECTED_LISTING_PRICE);
    expect(res.body.payload.seller_custom_field).toBe(product.sku);
    expect(res.body.preview.mlItemId).toBeTruthy();

    const rows = await prisma.mercadoLivreListing.findMany({ where: { productId: product.id } });
    expect(rows).toHaveLength(0);
    void account;
  });

  it("mode dry-run explícito com flag ligada também não grava nada", async () => {
    env.ML_PUBLISH_ENABLED = true;
    await createAccount();
    const product = await createProduct();

    const res = await request(app)
      .post(`/api/admin/mercadolivre/publish/${product.id}`)
      .set(auth)
      .send({ mode: "dry-run", expectedPrice: EXPECTED_LISTING_PRICE });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("dry-run");
    expect(res.body.forcedDryRun).toBe(false);
    const rows = await prisma.mercadoLivreListing.findMany({ where: { productId: product.id } });
    expect(rows).toHaveLength(0);
  });

  // Ajuste pós-etapa-5 (ponto A): dry-run NUNCA bloqueia por categoria/
  // embalagem ainda não prontas — ao contrário do resto da suíte, este teste
  // deliberadamente NÃO confirma a categoria no fixture (volta pro estado
  // real desta fase: verified=false) e usa uma peça fora de qualquer preset
  // de embalagem, para provar que os DOIS "issues" aparecem sem bloquear.
  it("funciona mesmo com categoria/embalagem não prontas: devolve payload + issues, publishable:false", async () => {
    env.ML_PUBLISH_ENABLED = true;
    GEMSTONE_CATEGORY_FIXTURE.verified = originalCategoryVerified;
    GEMSTONE_CATEGORY_FIXTURE.id = originalCategoryId;
    await createAccount();
    const product = await createProduct();
    await prisma.product.update({ where: { id: product.id }, data: { sizeCm: 500 } });

    const res = await request(app)
      .post(`/api/admin/mercadolivre/publish/${product.id}`)
      .set(auth)
      .send({ mode: "dry-run", expectedPrice: EXPECTED_LISTING_PRICE });

    expect(res.status).toBe(200);
    expect(res.body.payload.price).toBe(EXPECTED_LISTING_PRICE);
    expect(res.body.payload.shipping).toBeUndefined();
    expect(res.body.issues.sort()).toEqual(["category_not_verified", "package_requires_manual"]);
    expect(res.body.publishable).toBe(false);
    expect(res.body.notice).toBeTruthy();

    const rows = await prisma.mercadoLivreListing.findMany({ where: { productId: product.id } });
    expect(rows).toHaveLength(0);
  });

  it("peça elegível e dentro do preset: issues vazia e publishable:true, mesmo em dry-run", async () => {
    env.ML_PUBLISH_ENABLED = true;
    await createAccount();
    const product = await createProduct();

    const res = await request(app)
      .post(`/api/admin/mercadolivre/publish/${product.id}`)
      .set(auth)
      .send({ mode: "dry-run", expectedPrice: EXPECTED_LISTING_PRICE });

    expect(res.status).toBe(200);
    expect(res.body.issues).toEqual([]);
    expect(res.body.publishable).toBe(true);
    expect(res.body.notice).toBeNull();
  });
});

describe("POST /publish/:productId — validações de preço e confirmação", () => {
  it("rejeita preço divergente (409), sem gravar nada", async () => {
    const product = await createProduct();

    const res = await request(app)
      .post(`/api/admin/mercadolivre/publish/${product.id}`)
      .set(auth)
      .send({ mode: "dry-run", expectedPrice: EXPECTED_LISTING_PRICE + 50 });

    expect(res.status).toBe(409);
    const rows = await prisma.mercadoLivreListing.findMany({ where: { productId: product.id } });
    expect(rows).toHaveLength(0);
  });

  it("modo real sem confirm explícito é rejeitado (400), mesmo com preço correto", async () => {
    env.ML_PUBLISH_ENABLED = true;
    await createAccount();
    const product = await createProduct();

    const res = await request(app)
      .post(`/api/admin/mercadolivre/publish/${product.id}`)
      .set(auth)
      .send({ mode: "real", expectedPrice: EXPECTED_LISTING_PRICE });

    expect(res.status).toBe(400);
  });
});

describe("POST /publish/:productId — fluxo real: idempotência", () => {
  async function publishReal(productId: string) {
    return request(app)
      .post(`/api/admin/mercadolivre/publish/${productId}`)
      .set(auth)
      .send({ mode: "real", expectedPrice: EXPECTED_LISTING_PRICE, confirm: true });
  }

  it.each(["active", "paused", "publishing"])("bloqueia (409) quando já existe anúncio em status \"%s\"", async (status) => {
    env.ML_PUBLISH_ENABLED = true;
    const account = await createAccount();
    const product = await createProduct();
    await prisma.mercadoLivreListing.create({
      data: { accountId: account.id, productId: product.id, status, mlItemId: "ML-EXISTING" },
    });

    const res = await publishReal(product.id);
    expect(res.status).toBe(409);
  });

  it("status \"error\" NÃO bloqueia — libera nova tentativa de publicação", async () => {
    env.ML_PUBLISH_ENABLED = true;
    const account = await createAccount();
    const product = await createProduct();
    await prisma.mercadoLivreListing.create({
      data: { accountId: account.id, productId: product.id, status: "error", lastError: "tentativa anterior" },
    });

    const res = await publishReal(product.id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
  });
});

describe("POST /publish/:productId — fluxo real: sucesso e falhas", () => {
  async function publishReal(productId: string) {
    return request(app)
      .post(`/api/admin/mercadolivre/publish/${productId}`)
      .set(auth)
      .send({ mode: "real", expectedPrice: EXPECTED_LISTING_PRICE, confirm: true });
  }

  it("publica com sucesso: grava mlItemId/permalink, status active, lastSyncAt preenchido", async () => {
    env.ML_PUBLISH_ENABLED = true;
    await createAccount();
    const product = await createProduct();

    const res = await publishReal(product.id);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
    expect(res.body.mlItemId).toBeTruthy();

    const row = await prisma.mercadoLivreListing.findFirstOrThrow({ where: { productId: product.id } });
    expect(row.status).toBe("active");
    expect(row.mlItemId).toBe(res.body.mlItemId);
    expect(row.lastSyncAt).not.toBeNull();
    expect(row.lastError).toBeNull();
  });

  it("4xx de validação do ML: status error + lastError, SEM retry (createItem chamado uma única vez)", async () => {
    env.ML_PUBLISH_ENABLED = true;
    await createAccount();
    const product = await createProduct();

    const createItemSpy = vi.spyOn(fakeClient, "createItem");
    fakeClient.queueFailure("createItem", { type: "invalid_attribute", message: "atributo obrigatório ausente" });

    const res = await publishReal(product.id);

    expect(res.status).toBe(422);
    expect(createItemSpy).toHaveBeenCalledTimes(1);

    const row = await prisma.mercadoLivreListing.findFirstOrThrow({ where: { productId: product.id } });
    expect(row.status).toBe("error");
    expect(row.lastError).toContain("atributo obrigatório ausente");
    expect(row.mlItemId).toBeNull();
  });

  it("timeout/5xx ambíguo no POST: linha fica em \"publishing\", SEM retry (nunca dispara um segundo POST)", async () => {
    env.ML_PUBLISH_ENABLED = true;
    await createAccount();
    const product = await createProduct();

    const createItemSpy = vi.spyOn(fakeClient, "createItem");
    fakeClient.queueFailure("createItem", { type: "server_error" });

    const res = await publishReal(product.id);

    expect(res.status).toBe(502);
    expect(createItemSpy).toHaveBeenCalledTimes(1);

    const row = await prisma.mercadoLivreListing.findFirstOrThrow({ where: { productId: product.id } });
    expect(row.status).toBe("publishing");
    expect(row.lastError).toBeTruthy();
    expect(row.mlItemId).toBeNull();
  });

  it("falha só na descrição: item fica criado, status active, lastError \"description_failed\" (207)", async () => {
    env.ML_PUBLISH_ENABLED = true;
    await createAccount();
    const product = await createProduct();
    fakeClient.queueFailure("setItemDescription", { type: "server_error" });

    const res = await publishReal(product.id);

    expect(res.status).toBe(207);
    expect(res.body.warning).toBe("description_failed");
    expect(res.body.mlItemId).toBeTruthy();

    const row = await prisma.mercadoLivreListing.findFirstOrThrow({ where: { productId: product.id } });
    expect(row.status).toBe("active");
    expect(row.lastError).toBe("description_failed");
    expect(row.mlItemId).toBe(res.body.mlItemId);
  });

  it("rota de reenvio de descrição recupera do description_failed", async () => {
    env.ML_PUBLISH_ENABLED = true;
    await createAccount();
    const product = await createProduct();
    fakeClient.queueFailure("setItemDescription", { type: "server_error" });

    const published = await publishReal(product.id);
    expect(published.status).toBe(207);

    const retryRes = await request(app).post(`/api/admin/mercadolivre/publish/${product.id}/retry-description`).set(auth);
    expect(retryRes.status).toBe(200);

    const row = await prisma.mercadoLivreListing.findFirstOrThrow({ where: { productId: product.id } });
    expect(row.lastError).toBeNull();
    expect(row.lastSyncAt).not.toBeNull();
  });
});

describe("POST /reconcile/:productId", () => {
  async function publishReal(productId: string) {
    return request(app)
      .post(`/api/admin/mercadolivre/publish/${productId}`)
      .set(auth)
      .send({ mode: "real", expectedPrice: EXPECTED_LISTING_PRICE, confirm: true });
  }

  it("cenário timeout_item_created: publica, dá timeout, reconcilia e adota o item sem duplicar", async () => {
    env.ML_PUBLISH_ENABLED = true;
    await createAccount();
    const product = await createProduct();

    fakeClient.queueFailure("createItem", { type: "timeout_item_created", mlItemId: "FAKE-ITEM-TIMEOUT-1" });

    const publishRes = await publishReal(product.id);
    expect(publishRes.status).toBe(502);

    let rowAfterTimeout = await prisma.mercadoLivreListing.findFirstOrThrow({ where: { productId: product.id } });
    expect(rowAfterTimeout.status).toBe("publishing");
    expect(rowAfterTimeout.mlItemId).toBeNull();

    // O Mercado Livre "processou" mesmo sem a resposta chegar — o item já
    // existe no fake, achável por SKU (ver FakeMercadoLivrePublisherClient).
    expect(fakeClient.items.size).toBe(1);

    const reconcileRes = await request(app).post(`/api/admin/mercadolivre/reconcile/${product.id}`).set(auth);
    expect(reconcileRes.status).toBe(200);
    expect(reconcileRes.body.reconciled).toBe(true);
    expect(reconcileRes.body.mlItemId).toBe("FAKE-ITEM-TIMEOUT-1");

    const rowAfterReconcile = await prisma.mercadoLivreListing.findFirstOrThrow({ where: { productId: product.id } });
    expect(rowAfterReconcile.mlItemId).toBe("FAKE-ITEM-TIMEOUT-1");
    expect(rowAfterReconcile.status).toBe("active");

    // Nunca cria um segundo item — só o que o timeout já tinha criado.
    expect(fakeClient.items.size).toBe(1);
  });

  it("sem item encontrado por SKU: libera a linha (status error) para nova tentativa, sem reconciliar", async () => {
    env.ML_PUBLISH_ENABLED = true;
    const account = await createAccount();
    const product = await createProduct();
    await prisma.mercadoLivreListing.create({
      data: { accountId: account.id, productId: product.id, status: "publishing" },
    });

    const res = await request(app).post(`/api/admin/mercadolivre/reconcile/${product.id}`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.reconciled).toBe(false);
    expect(res.body.reason).toBe("not_found");

    const row = await prisma.mercadoLivreListing.findFirstOrThrow({ where: { productId: product.id } });
    expect(row.status).toBe("error");
  });

  // Ajuste pós-etapa-5 (ponto B): mais de um item achado por SKU é ambíguo
  // demais pra adotar automaticamente — responde 409 com a lista completa
  // pra decisão manual, sem alterar a linha local.
  it("mais de um item achado por SKU: 409 com a lista de candidatos, sem adotar nenhum", async () => {
    env.ML_PUBLISH_ENABLED = true;
    const account = await createAccount();
    const product = await createProduct();
    const listing = await prisma.mercadoLivreListing.create({
      data: { accountId: account.id, productId: product.id, status: "publishing" },
    });

    fakeClient.items.set("FAKE-ITEM-DUP-1", {
      id: "FAKE-ITEM-DUP-1",
      permalink: "https://produto.mercadolivre.com.br/FAKE-ITEM-DUP-1",
      status: "active",
      sellerCustomField: product.sku,
      description: "",
    });
    fakeClient.items.set("FAKE-ITEM-DUP-2", {
      id: "FAKE-ITEM-DUP-2",
      permalink: "https://produto.mercadolivre.com.br/FAKE-ITEM-DUP-2",
      status: "active",
      sellerCustomField: product.sku,
      description: "",
    });

    const res = await request(app).post(`/api/admin/mercadolivre/reconcile/${product.id}`).set(auth);

    expect(res.status).toBe(409);
    expect(res.body.reconciled).toBe(false);
    expect(res.body.reason).toBe("ambiguous");
    expect(res.body.candidates).toHaveLength(2);

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("publishing");
    expect(row.mlItemId).toBeNull();
  });
});

describe("POST /publish/:productId — concorrência (ponto C)", () => {
  it("duas publicações simultâneas da mesma peça resultam em um único POST /items (lock atômico)", async () => {
    env.ML_PUBLISH_ENABLED = true;
    await createAccount();
    const product = await createProduct();

    const createItemSpy = vi.spyOn(fakeClient, "createItem");

    const send = () =>
      request(app)
        .post(`/api/admin/mercadolivre/publish/${product.id}`)
        .set(auth)
        .send({ mode: "real", expectedPrice: EXPECTED_LISTING_PRICE, confirm: true });

    const [res1, res2] = await Promise.all([send(), send()]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(createItemSpy).toHaveBeenCalledTimes(1);

    const rows = await prisma.mercadoLivreListing.findMany({ where: { productId: product.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
  });
});
