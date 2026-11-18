import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";
import { FakeMercadoLivrePublisherClient } from "../src/lib/mercadoLivre/publisherClient";
import { setMercadoLivrePublisherClientForTests } from "../src/lib/mercadoLivre/publisherClientRegistry";

// Fase 1B etapa 8 — webhook público do Mercado Livre. SUPOSIÇÃO FORTE em
// TUDO (formato do corpo, tópicos, estados de pedido — ver CONTEXT.md) — o
// endpoint só recebe tráfego real depois que o app do Mercado Livre existir.
const app = createApp();
const WEBHOOK_URL = "/api/webhooks/mercadolivre";

let fakeClient: FakeMercadoLivrePublisherClient;

async function createProduct(sku: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prisma.product.create({
    data: {
      name: "Citrino Lapidado",
      slug: `citrino-${suffix}`,
      sku,
      price: 400,
      active: true,
      trackStock: false,
      weightGrams: 200,
      sizeCm: 8,
    },
  });
}

async function createAccount(mlUserId = "555666777") {
  return prisma.mercadoLivreAccount.create({
    data: {
      mlUserId,
      nickname: "LOJA_TESTE",
      accessToken: "ciphertext-fake-access",
      refreshToken: "ciphertext-fake-refresh",
      expiresAt: new Date(Date.now() + 3_600_000),
      scope: "offline_access read write",
    },
  });
}

function orderNotification(orderId: string, userId: string | number = "555666777") {
  return { topic: "orders_v2", resource: `/orders/${orderId}`, user_id: userId };
}

function itemNotification(mlItemId: string, userId: string | number = "555666777") {
  return { topic: "items", resource: `/items/${mlItemId}`, user_id: userId };
}

async function waitForProcessed(eventId: string, timeoutMs = 2000): Promise<void> {
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

describe("POST /api/webhooks/mercadolivre — validação de corpo", () => {
  it("JSON malformado: 400", async () => {
    const res = await request(app).post(WEBHOOK_URL).set("Content-Type", "application/json").send("{isso nao e json");
    expect(res.status).toBe(400);
  });

  it("corpo acima do limite: 413", async () => {
    const bigPayload = { topic: "orders_v2", resource: "/orders/1", padding: "x".repeat(200_000) };
    const res = await request(app).post(WEBHOOK_URL).send(bigPayload);
    expect(res.status).toBe(413);
  });
});

describe("POST /api/webhooks/mercadolivre — responde antes de processar", () => {
  it("responde 200 rapidamente mesmo com o GET ao Mercado Livre lento", async () => {
    const account = await createAccount();
    const product = await createProduct("CIT-SLOW-1");
    fakeClient.orders.set("9001", { id: "9001", status: "paid", items: [{ sellerCustomField: product.sku }] });

    vi.spyOn(fakeClient, "getOrder").mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ id: "9001", status: "paid", items: [{ sellerCustomField: product.sku }] }), 150))
    );

    const start = Date.now();
    const res = await request(app).post(WEBHOOK_URL).send(orderNotification("9001"));
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(100); // bem antes dos 150ms do GET simulado

    const event = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event.processedAt).toBeNull(); // ainda não processou no momento da resposta

    await waitForProcessed(event.id);
    const updatedProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(updatedProduct.soldChannel).toBe("mercadolivre");
    void account;
  });
});

describe("POST /api/webhooks/mercadolivre — deduplicação e checagem de conta", () => {
  it("evento duplicado (mesmo corpo): a segunda chamada não reprocessa", async () => {
    const body = orderNotification("1111");
    const res1 = await request(app).post(WEBHOOK_URL).send(body);
    expect(res1.status).toBe(200);
    await waitForProcessed(res1.body.eventId);

    const res2 = await request(app).post(WEBHOOK_URL).send(body);
    expect(res2.status).toBe(200);
    expect(res2.body.duplicate).toBe(true);

    const count = await prisma.mercadoLivreWebhookEvent.count();
    expect(count).toBe(1);
  });

  it("user_id diferente do da conta conectada: ignorado (note, sem efeito)", async () => {
    await createAccount("555666777");
    const product = await createProduct("CIT-MISMATCH-1");
    fakeClient.orders.set("2222", { id: "2222", status: "paid", items: [{ sellerCustomField: product.sku }] });

    const res = await request(app).post(WEBHOOK_URL).send(orderNotification("2222", "999999999"));
    await waitForProcessed(res.body.eventId);

    const event = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event.lastError).toBeNull();
    expect(event.note).toMatch(/user_id/);

    const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(unchanged.soldChannel).toBeNull();
  });

  it("sem conta conectada: ignorado (note, sem efeito)", async () => {
    const res = await request(app).post(WEBHOOK_URL).send(orderNotification("3333"));
    await waitForProcessed(res.body.eventId);

    const event = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event.lastError).toBeNull();
    expect(event.note).toMatch(/conectada/);
  });

  it("tópico desconhecido: registrado e ignorado (note, sem erro)", async () => {
    await createAccount();
    const res = await request(app).post(WEBHOOK_URL).send({ topic: "questions", resource: "/questions/1", user_id: "555666777" });
    await waitForProcessed(res.body.eventId);

    const event = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event.lastError).toBeNull();
    expect(event.note).toMatch(/desconhecido/);
  });
});

describe("POST /api/webhooks/mercadolivre — tópico orders_v2", () => {
  it("pedido pago: marca a peça como vendida (canal mercadolivre), idempotente", async () => {
    await createAccount();
    const product = await createProduct("CIT-PAID-1");
    fakeClient.orders.set("4444", { id: "4444", status: "paid", items: [{ sellerCustomField: product.sku }] });

    const res = await request(app).post(WEBHOOK_URL).send(orderNotification("4444"));
    await waitForProcessed(res.body.eventId);

    const sold = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(sold.active).toBe(false);
    expect(sold.soldChannel).toBe("mercadolivre");
    expect(sold.soldAt).not.toBeNull();

    const event = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event.lastError).toBeNull();
    expect(event.note).toMatch(/marcada como vendida/);

    // Reenviar o "mesmo" pedido pago de novo (notificação diferente, outro
    // hash) nunca duplica efeito — idempotente via markProductSold.
    const res2 = await request(app).post(WEBHOOK_URL).send({ ...orderNotification("4444"), extra: "retry-diferente" });
    await waitForProcessed(res2.body.eventId);
    const soldAgain = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(soldAgain.soldChannel).toBe("mercadolivre");
  });

  it("pedido cancelado: só avisa, NUNCA desfaz nada automaticamente", async () => {
    await createAccount();
    const product = await createProduct("CIT-CANCEL-1");
    fakeClient.orders.set("5555", { id: "5555", status: "cancelled", items: [{ sellerCustomField: product.sku }] });

    const res = await request(app).post(WEBHOOK_URL).send(orderNotification("5555"));
    await waitForProcessed(res.body.eventId);

    const event = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event.lastError).toBeNull();
    expect(event.note).toMatch(/cancelado/);

    const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(unchanged.active).toBe(true);
    expect(unchanged.soldChannel).toBeNull();
  });

  it("SKU não encontrado no catálogo: evento registrado com ERRO, sem efeito", async () => {
    await createAccount();
    fakeClient.orders.set("6666", { id: "6666", status: "paid", items: [{ sellerCustomField: "SKU-FANTASMA" }] });

    const res = await request(app).post(WEBHOOK_URL).send(orderNotification("6666"));
    await waitForProcessed(res.body.eventId);

    const event = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event.lastError).toMatch(/não encontrado/);
  });

  it("falha de API ao buscar o pedido: registrado com erro — reprocessável depois", async () => {
    await createAccount();
    const product = await createProduct("CIT-APIERR-1");
    fakeClient.orders.set("7777", { id: "7777", status: "paid", items: [{ sellerCustomField: product.sku }] });
    fakeClient.queueFailure("getOrder", { type: "server_error" });

    const res = await request(app).post(WEBHOOK_URL).send(orderNotification("7777"));
    await waitForProcessed(res.body.eventId);

    const event = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event.lastError).toBeTruthy();

    const stillActive = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(stillActive.soldChannel).toBeNull();
  });
});

describe("POST /api/webhooks/mercadolivre — tópico items", () => {
  it("sincroniza o status local do anúncio a partir do Mercado Livre", async () => {
    const account = await createAccount();
    const product = await createProduct("CIT-ITEMSYNC-1");
    const listing = await prisma.mercadoLivreListing.create({
      data: { accountId: account.id, productId: product.id, status: "active", mlItemId: "ML-ITEM-1" },
    });
    fakeClient.items.set("ML-ITEM-1", {
      id: "ML-ITEM-1",
      permalink: "https://produto.mercadolivre.com.br/ML-ITEM-1",
      status: "paused",
      sellerCustomField: product.sku,
      description: "",
    });

    const res = await request(app).post(WEBHOOK_URL).send(itemNotification("ML-ITEM-1"));
    await waitForProcessed(res.body.eventId);

    const row = await prisma.mercadoLivreListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("paused");

    const event = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event.lastError).toBeNull();
    expect(event.note).toMatch(/sincronizado/);
  });

  it("item sem anúncio local correspondente: ignorado (note, sem erro)", async () => {
    await createAccount();
    const res = await request(app).post(WEBHOOK_URL).send(itemNotification("ML-ITEM-DESCONHECIDO"));
    await waitForProcessed(res.body.eventId);

    const event = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(event.lastError).toBeNull();
    expect(event.note).toMatch(/nenhum anúncio/);
  });
});

describe("Admin: GET /webhook-events e POST /webhook-events/:id/reprocess", () => {
  it("lista só eventos com erro por padrão; ?status=all lista todos", async () => {
    await createAccount();
    fakeClient.orders.set("8888", { id: "8888", status: "paid", items: [{ sellerCustomField: "SKU-INEXISTENTE" }] });

    const errored = await request(app).post(WEBHOOK_URL).send(orderNotification("8888"));
    await waitForProcessed(errored.body.eventId);
    const ok = await request(app).post(WEBHOOK_URL).send({ topic: "questions", resource: "/questions/1", user_id: "555666777" });
    await waitForProcessed(ok.body.eventId);

    const auth = { Authorization: `Bearer ${generateTestToken({ sub: "admin-webhook-test" })}` };

    const errorsOnly = await request(app).get("/api/admin/mercadolivre/webhook-events").set(auth);
    expect(errorsOnly.status).toBe(200);
    expect(errorsOnly.body.items).toHaveLength(1);
    expect(errorsOnly.body.items[0].id).toBe(errored.body.eventId);

    const all = await request(app).get("/api/admin/mercadolivre/webhook-events").query({ status: "all" }).set(auth);
    expect(all.body.items).toHaveLength(2);
  });

  it("reprocessa um evento com erro e corrige quando a causa já foi resolvida", async () => {
    await createAccount();
    const product = await createProduct("CIT-REPROCESS-1");
    fakeClient.orders.set("9999", { id: "9999", status: "paid", items: [{ sellerCustomField: product.sku }] });
    fakeClient.queueFailure("getOrder", { type: "server_error" });

    const first = await request(app).post(WEBHOOK_URL).send(orderNotification("9999"));
    await waitForProcessed(first.body.eventId);

    const before = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: first.body.eventId } });
    expect(before.lastError).toBeTruthy();

    const auth = { Authorization: `Bearer ${generateTestToken({ sub: "admin-webhook-test" })}` };
    const reprocessRes = await request(app)
      .post(`/api/admin/mercadolivre/webhook-events/${first.body.eventId}/reprocess`)
      .set(auth);

    expect(reprocessRes.status).toBe(200);
    expect(reprocessRes.body.ok).toBe(true);
    expect(reprocessRes.body.event.lastError).toBeNull();

    const sold = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(sold.soldChannel).toBe("mercadolivre");
  });

  it("reprocessar evento inexistente: 404", async () => {
    const auth = { Authorization: `Bearer ${generateTestToken({ sub: "admin-webhook-test" })}` };
    const res = await request(app).post("/api/admin/mercadolivre/webhook-events/id-que-nao-existe/reprocess").set(auth);
    expect(res.status).toBe(404);
  });
});
