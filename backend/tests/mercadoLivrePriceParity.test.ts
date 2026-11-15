import { afterAll, afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { generateTestToken } from "./helpers";
import { buildSimulationCsvRows } from "../src/scripts/simulateMercadoLivre";

// Garante que a rota admin (GET /api/admin/mercadolivre/simulate/:productId)
// e o script scripts/simulateMercadoLivre.ts nunca divirjam silenciosamente
// no breakdown de preço — os dois usam os MESMOS UNVERIFIED_DEFAULT_* de
// priceCalculator.ts (única fonte de configuração das taxas), mas cada um
// resolve/monta a chamada a calculateSuggestedPrice de forma independente
// (um numa rota Express, outro num script de linha de comando); este teste
// prova que o resultado final é idêntico, não só que "deveriam" ser.
const app = createApp();
const auth = { Authorization: `Bearer ${generateTestToken({ sub: "admin-ml-parity-test" })}` };

async function createEligibleProduct(sku: string, overrides: Partial<Parameters<typeof prisma.product.create>[0]["data"]> = {}) {
  await prisma.product.create({
    data: {
      name: "Peça Paridade Rota x Script",
      slug: `paridade-${sku.toLowerCase()}-${Date.now()}`,
      sku,
      price: 2500,
      weightGrams: 500,
      sizeCm: 10,
      images: { create: [{ url: "https://r2.example/parity.webp", key: `parity-${sku}`, position: 0, width: 1080, height: 1920 }] },
      ...overrides,
    },
  });
  return prisma.product.findUniqueOrThrow({ where: { sku }, include: { images: true } });
}

describe("paridade: rota admin GET /simulate/:productId e scripts/simulateMercadoLivre.ts", () => {
  afterEach(async () => {
    await prisma.productImage.deleteMany();
    await prisma.product.deleteMany();
    await prisma.mercadoLivreAccount.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("mesmo markupPct explícito, mesma peça: breakdown de preço idêntico nos dois", async () => {
    const sku = `PARITY-A-${Date.now()}`;
    const product = await createEligibleProduct(sku, { price: 2500, weightGrams: 500, sizeCm: 10 });

    const routeRes = await request(app).get(`/api/admin/mercadolivre/simulate/${product.id}`).query({ markupPct: 15 }).set(auth);
    expect(routeRes.status).toBe(200);
    expect(routeRes.body.eligible).toBe(true);

    const [scriptRow] = buildSimulationCsvRows([sku], [product], 15);

    const routePrice = routeRes.body.price;
    expect(scriptRow.preco_base).toBe(routePrice.basePrice.toFixed(2));
    expect(scriptRow.acrescimo).toBe(routePrice.markupAmount.toFixed(2));
    expect(scriptRow.preco_anuncio).toBe(routePrice.listingPrice.toFixed(2));
    expect(scriptRow.comissao_estimativa_nao_verificada).toBe(routePrice.commissionAmount.toFixed(2));
    expect(scriptRow.tarifa_fixa_estimativa_nao_verificada).toBe(routePrice.fixedFeeBRL.toFixed(2));
    expect(scriptRow.frete_estimado_estimativa_nao_verificada).toBe(routePrice.shippingCostBRL.toFixed(2));
    expect(scriptRow.liquido_estimado).toBe(routePrice.netReceived.toFixed(2));
  });

  it("sem overrides (nem query, nem conta conectada): os padrões não verificados batem exatamente nos dois, e o frete não é mais zero", async () => {
    const sku = `PARITY-B-${Date.now()}`;
    const product = await createEligibleProduct(sku, { price: 1000, weightGrams: 300, sizeCm: 5 });

    const routeRes = await request(app).get(`/api/admin/mercadolivre/simulate/${product.id}`).set(auth);
    expect(routeRes.status).toBe(200);
    expect(routeRes.body.price.estimatesUsed).toEqual({ commissionPct: true, fixedFeeBRL: true, shippingCostBRL: true });

    const [scriptRow] = buildSimulationCsvRows([sku], [product], 0);

    expect(scriptRow.comissao_estimativa_nao_verificada).toBe(routeRes.body.price.commissionAmount.toFixed(2));
    expect(scriptRow.tarifa_fixa_estimativa_nao_verificada).toBe(routeRes.body.price.fixedFeeBRL.toFixed(2));
    expect(scriptRow.frete_estimado_estimativa_nao_verificada).toBe(routeRes.body.price.shippingCostBRL.toFixed(2));
    expect(Number(scriptRow.frete_estimado_estimativa_nao_verificada)).toBeGreaterThan(0);
  });

  it("markupPct da conta conectada: rota e script resolvem o mesmo valor e dão o mesmo breakdown", async () => {
    await prisma.mercadoLivreAccount.create({
      data: {
        mlUserId: "999",
        nickname: "LOJA_PARIDADE_TESTE",
        accessToken: "token-fake-nao-usado-neste-teste",
        refreshToken: "refresh-fake-nao-usado-neste-teste",
        expiresAt: new Date(Date.now() + 3600_000),
        scope: "offline_access read write",
        markupPct: 8,
      },
    });
    const sku = `PARITY-C-${Date.now()}`;
    const product = await createEligibleProduct(sku, { price: 800, weightGrams: 200, sizeCm: 4 });

    const routeRes = await request(app).get(`/api/admin/mercadolivre/simulate/${product.id}`).set(auth);
    expect(routeRes.status).toBe(200);
    expect(routeRes.body.price.listingPrice).toBeCloseTo(800 * 1.08, 5);

    // Script: sem --markup explícito, resolve o mesmo markupPct da conta
    // (ver fetchReadOnly em simulateMercadoLivre.ts) — aqui simulado
    // passando o valor já resolvido, já que buildSimulationCsvRows recebe o
    // markup como parâmetro puro (a resolução por conta é feita em main()).
    const [scriptRow] = buildSimulationCsvRows([sku], [product], 8);

    expect(scriptRow.preco_anuncio).toBe(routeRes.body.price.listingPrice.toFixed(2));
    expect(scriptRow.liquido_estimado).toBe(routeRes.body.price.netReceived.toFixed(2));
  });
});
