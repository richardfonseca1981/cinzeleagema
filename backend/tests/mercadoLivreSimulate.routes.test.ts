import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { generateTestToken } from "./helpers";

const app = createApp();
const auth = { Authorization: `Bearer ${generateTestToken({ sub: "admin-ml-simulate-test" })}` };

async function createEligibleProduct(overrides: Partial<Parameters<typeof prisma.product.create>[0]["data"]> = {}) {
  return prisma.product.create({
    data: {
      name: "Topázio Imperial Simulação",
      slug: `topazio-simulacao-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sku: `SIM-${Math.random().toString(36).slice(2, 8)}`,
      price: 1500,
      weightGrams: 2,
      sizeCm: 1.5,
      ...overrides,
      images: {
        create: [
          { url: "https://r2.example/sim-1.webp", key: "sim-1", position: 0, width: 1080, height: 1920 },
          { url: "https://r2.example/sim-2.webp", key: "sim-2", position: 1, width: 1080, height: 1920 },
        ],
      },
    },
  });
}

describe("GET /api/admin/mercadolivre/simulate/:productId", () => {
  afterEach(async () => {
    await prisma.productImage.deleteMany();
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("sem token responde 401", async () => {
    const product = await createEligibleProduct();
    const res = await request(app).get(`/api/admin/mercadolivre/simulate/${product.id}`);
    expect(res.status).toBe(401);
  });

  it("peça inexistente responde 404", async () => {
    const res = await request(app).get("/api/admin/mercadolivre/simulate/produto-que-nao-existe").set(auth);
    expect(res.status).toBe(404);
  });

  it("peça inapta devolve eligible:false com os motivos, sem draft nem preço", async () => {
    const product = await createEligibleProduct({ price: null });
    const res = await request(app).get(`/api/admin/mercadolivre/simulate/${product.id}`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
    expect(res.body.blockers.map((b: { code: string }) => b.code)).toContain("missing_price");
    expect(res.body.draft).toBeUndefined();
  });

  it("peça apta devolve draft, preço e os avisos não-bloqueantes, usando estimativas padrão", async () => {
    const product = await createEligibleProduct();
    const res = await request(app).get(`/api/admin/mercadolivre/simulate/${product.id}`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(res.body.draft.title).toContain("Topázio Imperial Simulação");
    expect(res.body.draft.photos).toHaveLength(2);
    expect(res.body.warnings.map((w: { code: string }) => w.code)).toContain("review_photo_branding");

    expect(res.body.price.basePrice).toBe(1500);
    expect(res.body.price.estimatesUsed).toEqual({ commissionPct: true, fixedFeeBRL: true, shippingCostBRL: true });
  });

  it("aceita comissão/tarifa/frete/markup informados via query, sem usar os padrões não verificados", async () => {
    const product = await createEligibleProduct({ price: 1000 });
    const res = await request(app)
      .get(`/api/admin/mercadolivre/simulate/${product.id}`)
      .query({ markupPct: 20, commissionPct: 10, fixedFeeBRL: 5, shippingCostBRL: 30 })
      .set(auth);

    expect(res.status).toBe(200);
    expect(res.body.price.listingPrice).toBeCloseTo(1200, 5);
    expect(res.body.price.commissionAmount).toBeCloseTo(120, 5);
    expect(res.body.price.netReceived).toBeCloseTo(1200 - 120 - 5 - 30, 5);
    expect(res.body.price.estimatesUsed).toEqual({ commissionPct: false, fixedFeeBRL: false, shippingCostBRL: false });
  });
});
