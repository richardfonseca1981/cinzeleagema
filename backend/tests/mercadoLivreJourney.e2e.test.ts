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

// Fechamento da Fase 1B — ensaio ponta a ponta com o cliente FAKE, como UM
// único cenário contínuo (não casos isolados): prévia -> publicar -> (ESTE
// primeiro publish simula o caso "timeout_item_created" de propósito, para
// o passo de reconciliação ter algo real para resolver — é o único ponto do
// sistema em que reconciliar faz sentido: ver mercadoLivre.routes.ts,
// /reconcile só age sobre status "publishing"/"error") -> reconciliação ->
// pausar -> reativar -> marcar vendida (dispara pausa automática) -> webhook
// de pedido pago (idempotente — mesma peça, canal diferente) -> sync. Cada
// etapa consome o estado deixado pela anterior, na MESMA peça/anúncio.
const app = createApp();
const auth = { Authorization: `Bearer ${generateTestToken({ sub: "admin-ml-journey-test" })}` };
const WEBHOOK_URL = "/api/webhooks/mercadolivre";

const originalListingTypeId = env.ML_LISTING_TYPE_ID;
const originalPublishEnabled = env.ML_PUBLISH_ENABLED;
const originalCategoryVerified = GEMSTONE_CATEGORY_FIXTURE.verified;
const originalCategoryId = GEMSTONE_CATEGORY_FIXTURE.id;

let fakeClient: FakeMercadoLivrePublisherClient;

// price=2000, markup=20%: listingPrice = 2000*1.2 = 2400 (mesma fórmula de
// priceCalculator.ts usada em mercadoLivrePublish.routes.test.ts).
const EXPECTED_LISTING_PRICE = 2400;

async function createJourneyProduct() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const product = await prisma.product.create({
    data: {
      name: "Ametista Lapidada Jornada",
      slug: `ametista-jornada-${suffix}`,
      sku: `AMJ-${suffix}`,
      price: 2000,
      active: true,
      trackStock: false,
      weightGrams: 850,
      sizeCm: 23,
      // Título aprovado desde o início — esta jornada testa o ciclo de vida
      // do anúncio (publicar/pausar/reativar/vender/webhook/sync), não a
      // aprovação de título em si.
      mlTitle: "Ametista Lapidada Jornada",
      mlTitleApprovedAt: new Date(),
    },
  });
  await prisma.productImage.create({
    data: {
      productId: product.id,
      url: "https://cdn.test/amj-1.jpg",
      key: `products/${product.id}/1.jpg`,
      position: 0,
      width: 1080,
      height: 1920,
    },
  });
  return product;
}

async function createJourneyAccount() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prisma.mercadoLivreAccount.create({
    data: {
      mlUserId: `ml-journey-${suffix}`,
      nickname: "LOJA_JORNADA",
      accessToken: "ciphertext-fake-access",
      refreshToken: "ciphertext-fake-refresh",
      expiresAt: new Date(Date.now() + 3_600_000),
      scope: "offline_access read write",
      markupPct: 20,
    },
  });
}

async function waitForWebhookProcessed(eventId: string, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const event = await prisma.mercadoLivreWebhookEvent.findUnique({ where: { id: eventId } });
    if (event?.processedAt) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`evento ${eventId} não foi processado em ${timeoutMs}ms`);
}

beforeEach(async () => {
  await cleanDatabase();
  env.ML_LISTING_TYPE_ID = "gold_special";
  // Categoria do Mercado Livre nunca foi confirmada de verdade nesta fase
  // (ver categoryFixture.ts) — "verificada" só durante esta suíte, mesma
  // técnica de mercadoLivrePublish.routes.test.ts.
  GEMSTONE_CATEGORY_FIXTURE.verified = true;
  GEMSTONE_CATEGORY_FIXTURE.id = "MLB-JOURNEY-VERIFIED";
  env.ML_PUBLISH_ENABLED = true;

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

describe("Mercado Livre — jornada completa (fechamento Fase 1B)", () => {
  it("prévia -> publicar (timeout) -> reconciliação -> pausar -> reativar -> marcar vendida -> webhook pedido pago -> sync", async () => {
    const account = await createJourneyAccount();
    const product = await createJourneyProduct();

    // 1) PRÉVIA — dry-run nunca grava nada, só mostra o payload/pendências.
    const preview = await request(app)
      .post(`/api/admin/mercadolivre/publish/${product.id}`)
      .set(auth)
      .send({ mode: "dry-run", expectedPrice: EXPECTED_LISTING_PRICE });

    expect(preview.status).toBe(200);
    expect(preview.body.mode).toBe("dry-run");
    expect(preview.body.publishable).toBe(true);
    expect(preview.body.payload.seller_custom_field).toBe(product.sku);
    expect(await prisma.mercadoLivreListing.count({ where: { productId: product.id } })).toBe(0);

    // 2) PUBLICAR — simula o caso real "timeout_item_created": o Mercado
    // Livre processou e criou o item, mas a resposta nunca chegou. A linha
    // local fica em "publishing", sem mlItemId — ambígua de propósito.
    fakeClient.queueFailure("createItem", { type: "timeout_item_created", mlItemId: "FAKE-ITEM-JOURNEY-1" });

    const publish = await request(app)
      .post(`/api/admin/mercadolivre/publish/${product.id}`)
      .set(auth)
      .send({ mode: "real", expectedPrice: EXPECTED_LISTING_PRICE, confirm: true });

    expect(publish.status).toBe(502);
    const afterPublish = await prisma.mercadoLivreListing.findFirstOrThrow({ where: { productId: product.id } });
    expect(afterPublish.status).toBe("publishing");
    expect(afterPublish.mlItemId).toBeNull();
    expect(fakeClient.items.size).toBe(1);

    // 3) RECONCILIAÇÃO APÓS TIMEOUT — encontra o item criado do outro lado
    // por SKU e adota, sem duplicar o anúncio.
    const reconcile = await request(app).post(`/api/admin/mercadolivre/reconcile/${product.id}`).set(auth);
    expect(reconcile.status).toBe(200);
    expect(reconcile.body.reconciled).toBe(true);
    expect(reconcile.body.mlItemId).toBe("FAKE-ITEM-JOURNEY-1");
    expect(reconcile.body.status).toBe("active");

    // 4) PAUSAR
    const pause = await request(app).post(`/api/admin/mercadolivre/listings/${product.id}/pause`).set(auth);
    expect(pause.status).toBe(200);
    expect(pause.body.status).toBe("paused");
    expect(fakeClient.items.get("FAKE-ITEM-JOURNEY-1")?.status).toBe("paused");

    // 5) REATIVAR
    const reactivate = await request(app).post(`/api/admin/mercadolivre/listings/${product.id}/reactivate`).set(auth);
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.status).toBe("active");
    expect(fakeClient.items.get("FAKE-ITEM-JOURNEY-1")?.status).toBe("active");

    // 6) MARCAR VENDIDA (venda direta no site) — pausa automática do
    // anúncio ML ativo, mesma função de domínio usada pelo webhook abaixo.
    const markSold = await request(app)
      .post(`/api/admin/products/${product.id}/mark-sold`)
      .set(auth)
      .send({ channel: "site", confirm: true });

    expect(markSold.status).toBe(200);
    expect(markSold.body.active).toBe(false);
    expect(markSold.body.soldChannel).toBe("site");
    expect(markSold.body.soldAt).toBeTruthy();
    expect(markSold.body.mlListing.status).toBe("paused");
    expect(fakeClient.items.get("FAKE-ITEM-JOURNEY-1")?.status).toBe("paused");

    // 7) WEBHOOK DE PEDIDO PAGO — notificação tardia do Mercado Livre para
    // a MESMA peça (ex.: o comprador pagou no ML quase ao mesmo tempo da
    // venda presencial registrada no passo 6). markProductSold é idempotente
    // e, com canal "mercadolivre", NUNCA tenta pausar o próprio anúncio que
    // originou a venda — o anúncio permanece exatamente como o passo 6
    // deixou.
    fakeClient.orders.set("9001", { id: "9001", status: "paid", items: [{ sellerCustomField: product.sku }] });

    const webhook = await request(app)
      .post(WEBHOOK_URL)
      .send({ topic: "orders_v2", resource: "/orders/9001", user_id: account.mlUserId });

    expect(webhook.status).toBe(200);
    await waitForWebhookProcessed(webhook.body.eventId);

    const event = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: webhook.body.eventId } });
    expect(event.lastError).toBeNull();
    expect(event.note).toContain("marcada como vendida");

    const productAfterWebhook = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(productAfterWebhook.active).toBe(false);
    expect(productAfterWebhook.soldChannel).toBe("mercadolivre"); // sobrescrito pelo webhook, idempotente
    expect(fakeClient.items.get("FAKE-ITEM-JOURNEY-1")?.status).toBe("paused"); // nunca tocado pelo webhook

    // 8) SYNC — confirma que o estado local já bate com o remoto (nenhuma
    // mudança nesta etapa, só validação).
    const sync = await request(app).get(`/api/admin/mercadolivre/listings/${product.id}/sync`).set(auth);
    expect(sync.status).toBe(200);
    expect(sync.body.status).toBe("paused");
    expect(sync.body.synced).toBe(true);

    const finalListing = await prisma.mercadoLivreListing.findFirstOrThrow({ where: { productId: product.id } });
    expect(finalListing.status).toBe("paused");
    expect(finalListing.mlItemId).toBe("FAKE-ITEM-JOURNEY-1");
  });
});
