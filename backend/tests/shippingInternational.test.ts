import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/lib/env";
import { cleanDatabase } from "./helpers";
import { InternationalTableProvider } from "../src/lib/shipping/internationalProvider";
import { getShipmentConfig, type ShipmentItem } from "../src/lib/shipping/shipment";
import { __resetShippingQuoteCacheForTests } from "../src/lib/shipping/quoteCache";

const app = createApp();
const provider = new InternationalTableProvider();
const config = getShipmentConfig(env);

let categoryId: string;

beforeEach(async () => {
  await cleanDatabase();
  __resetShippingQuoteCacheForTests();
  categoryId = (await prisma.category.create({ data: { name: "Pedras", slug: "pedras" } })).id;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

async function createZone(
  countries: string[],
  rates: Array<{ serviceName: string; maxWeightG: number; priceBRL: number; min?: number | null; max?: number | null; active?: boolean }>,
  overrides: { active?: boolean; name?: string } = {}
) {
  return prisma.shippingZone.create({
    data: {
      name: overrides.name ?? "Zona teste",
      countries,
      active: overrides.active ?? true,
      rates: {
        create: rates.map((rate) => ({
          serviceName: rate.serviceName,
          maxWeightG: rate.maxWeightG,
          priceBRL: rate.priceBRL.toFixed(2),
          deliveryDaysMin: rate.min ?? null,
          deliveryDaysMax: rate.max ?? null,
          active: rate.active ?? true,
        })),
      },
    },
  });
}

const item = (overrides: Partial<ShipmentItem> = {}): ShipmentItem => ({
  weightGrams: 80,
  sizeCm: 3,
  quantity: 1,
  unitPriceBRL: 100,
  ...overrides,
});

async function createProduct(overrides: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      name: "Ametista Lapidada",
      slug: `ametista-${Math.random().toString(36).slice(2)}`,
      price: 250.5,
      weightGrams: 80,
      sizeCm: 3,
      categoryId,
      ...overrides,
    },
  });
}

// Peso total de um item de 80 g = 80 + 300 de embalagem = 380 g.
describe("InternationalTableProvider", () => {
  it("escolhe a MENOR faixa ativa que comporta o peso, com opção definitiva", async () => {
    await createZone(["US"], [
      { serviceName: "DHL", maxWeightG: 2000, priceBRL: 300, min: 5, max: 8 },
      { serviceName: "DHL", maxWeightG: 500, priceBRL: 150.5, min: 5, max: 8 },
      { serviceName: "DHL", maxWeightG: 1000, priceBRL: 200, min: 5, max: 8 },
    ]);

    const result = await provider.calculateForItems("US", [item()], config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.options).toHaveLength(1);
    expect(result.options[0]).toMatchObject({
      carrier: "DHL",
      service: "DHL",
      priceBRL: 150.5,
      deliveryDaysMin: 5,
      deliveryDaysMax: 8,
      kind: "quoted",
    });
    expect(result.options[0].id).toMatch(/^intl-/);
  });

  it("peso exatamente no limite da faixa ainda comporta; 1 g acima passa para a próxima", async () => {
    await createZone(["US"], [
      { serviceName: "Correios", maxWeightG: 380, priceBRL: 100 },
      { serviceName: "Correios", maxWeightG: 381, priceBRL: 120 },
    ]);

    const exact = await provider.calculateForItems("US", [item()], config); // 380 g
    const above = await provider.calculateForItems("US", [item({ weightGrams: 81 })], config); // 381 g
    const over = await provider.calculateForItems("US", [item({ weightGrams: 82 })], config); // 382 g

    expect(exact.ok && exact.options[0].priceBRL).toBe(100);
    expect(above.ok && above.options[0].priceBRL).toBe(120);
    expect(over).toEqual({ ok: false, reason: "over_limits" });
  });

  it("vários serviços: um por serviço; serviço sem faixa que comporte é omitido; ordenado por preço", async () => {
    await createZone(["PT"], [
      { serviceName: "Expresso", maxWeightG: 2000, priceBRL: 400, min: 3, max: 4 },
      { serviceName: "Econômico", maxWeightG: 3000, priceBRL: 90, min: 15, max: 25 },
      { serviceName: "Pequeno", maxWeightG: 300, priceBRL: 40 },
    ]);

    const result = await provider.calculateForItems("PT", [item()], config); // 380 g

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.options.map((o) => o.service)).toEqual(["Econômico", "Expresso"]);
  });

  it("faixa inativa é ignorada; se só sobra faixa pequena demais, over_limits", async () => {
    await createZone(["PT"], [
      { serviceName: "A", maxWeightG: 5000, priceBRL: 10, active: false },
      { serviceName: "A", maxWeightG: 300, priceBRL: 5 },
    ]);
    expect(await provider.calculateForItems("PT", [item()], config)).toEqual({ ok: false, reason: "over_limits" });
  });

  it("prazos nulos continuam nulos e o preço sai com 2 casas", async () => {
    await createZone(["AR"], [{ serviceName: "Aéreo", maxWeightG: 1000, priceBRL: 99.9 }]);
    const result = await provider.calculateForItems("AR", [item()], config);
    expect(result.ok && result.options[0]).toMatchObject({ deliveryDaysMin: null, deliveryDaysMax: null, priceBRL: 99.9 });
  });

  it("país sem zona: no_rates_configured", async () => {
    await createZone(["US"], [{ serviceName: "DHL", maxWeightG: 1000, priceBRL: 10 }]);
    expect(await provider.calculateForItems("FR", [item()], config)).toEqual({ ok: false, reason: "no_rates_configured" });
  });

  it("zona inativa é ignorada: no_rates_configured", async () => {
    await createZone(["US"], [{ serviceName: "DHL", maxWeightG: 1000, priceBRL: 10 }], { active: false });
    expect(await provider.calculateForItems("US", [item()], config)).toEqual({ ok: false, reason: "no_rates_configured" });
  });

  it("zona sem tarifas (ou só com tarifas inativas): no_rates_configured", async () => {
    await createZone(["US"], []);
    await createZone(["PT"], [{ serviceName: "DHL", maxWeightG: 1000, priceBRL: 10, active: false }]);
    expect(await provider.calculateForItems("US", [item()], config)).toEqual({ ok: false, reason: "no_rates_configured" });
    expect(await provider.calculateForItems("PT", [item()], config)).toEqual({ ok: false, reason: "no_rates_configured" });
  });

  it("peça acima de 25 cm ou volume acima de 60% da caixa: over_limits (mesmas regras do Brasil)", async () => {
    await createZone(["US"], [{ serviceName: "DHL", maxWeightG: 30000, priceBRL: 10 }]);
    expect(await provider.calculateForItems("US", [item({ sizeCm: 26 })], config)).toEqual({ ok: false, reason: "over_limits" });
    // 19 peças de 10 cm = 19000 cm³ > 18000 (60% de 30000)
    expect(await provider.calculateForItems("US", [item({ sizeCm: 10, quantity: 19 })], config)).toEqual({
      ok: false,
      reason: "over_limits",
    });
  });

  it("peso ou tamanho zerados: incomplete_product_data", async () => {
    await createZone(["US"], [{ serviceName: "DHL", maxWeightG: 30000, priceBRL: 10 }]);
    expect(await provider.calculateForItems("US", [item({ weightGrams: 0 })], config)).toEqual({
      ok: false,
      reason: "incomplete_product_data",
    });
    expect(await provider.calculateForItems("US", [item({ sizeCm: 0 })], config)).toEqual({
      ok: false,
      reason: "incomplete_product_data",
    });
  });

  it("o Brasil nunca é atendido pela tabela", async () => {
    expect(await provider.calculate({ originPostalCode: "", destinationPostalCode: "", destinationCountry: "BR", shipment: { box: { lengthCm: 40, widthCm: 30, heightCm: 25 }, weightGrams: 500, insuranceValueBRL: 0 } })).toEqual({
      ok: false,
      reason: "invalid_destination",
    });
  });
});

describe("POST /api/shipping/quote — exterior (contrato)", () => {
  const quote = (productId: string, country: string, quantity = 1, postalCode?: string) =>
    request(app)
      .post("/api/shipping/quote")
      .send({ country, ...(postalCode !== undefined ? { postalCode } : {}), items: [{ productId, quantity }] });

  it("devolve opções DEFINITIVAS com o aviso de impostos de importação", async () => {
    const product = await createProduct();
    await createZone(["US", "CA"], [
      { serviceName: "DHL Express", maxWeightG: 1000, priceBRL: 250, min: 4, max: 6 },
      { serviceName: "Correios Internacional", maxWeightG: 1000, priceBRL: 120, min: 12, max: 20 },
    ]);

    const res = await quote(product.id, "US");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      destination: { country: "US", postalCode: "", city: null, state: null },
      mode: "international",
      requiresConfirmation: false,
      notice: "taxes_not_included",
      unavailable: null,
    });
    expect(res.body.options.map((o: { service: string; priceBRL: number; kind: string }) => [o.service, o.priceBRL, o.kind])).toEqual([
      ["Correios Internacional", 120, "quoted"],
      ["DHL Express", 250, "quoted"],
    ]);
  });

  it("país sem zona: unavailable com aviso de impostos e sem exigir confirmação", async () => {
    const product = await createProduct();
    const res = await quote(product.id, "FR");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      mode: "international",
      options: [],
      requiresConfirmation: false,
      notice: "taxes_not_included",
      unavailable: { reason: "no_rates_configured" },
    });
  });

  it("over_limits por peso da tabela, por peça grande e por volume — todos com aviso de impostos", async () => {
    await createZone(["US"], [{ serviceName: "DHL", maxWeightG: 400, priceBRL: 10 }]);

    const heavy = await createProduct({ weightGrams: 500 });
    const big = await createProduct({ sizeCm: 26 });
    const many = await createProduct({ sizeCm: 10 });

    for (const res of [await quote(heavy.id, "US"), await quote(big.id, "US"), await quote(many.id, "US", 19)]) {
      expect(res.body.unavailable).toEqual({ reason: "over_limits" });
      expect(res.body.notice).toBe("taxes_not_included");
      expect(res.body.mode).toBe("international");
    }
  });

  it("produto incompleto: incomplete_product_data, também com aviso de impostos", async () => {
    await createZone(["US"], [{ serviceName: "DHL", maxWeightG: 400, priceBRL: 10 }]);
    const product = await createProduct({ weightGrams: 0 });
    const res = await quote(product.id, "US");
    expect(res.body).toMatchObject({ unavailable: { reason: "incomplete_product_data" }, notice: "taxes_not_included" });
  });

  it("código postal continua opcional fora do Brasil", async () => {
    const product = await createProduct();
    await createZone(["US"], [{ serviceName: "DHL", maxWeightG: 1000, priceBRL: 10 }]);
    expect((await quote(product.id, "US")).status).toBe(200);
    expect((await quote(product.id, "US", 1, "")).status).toBe(200);
    expect((await quote(product.id, "US", 1, "10001")).status).toBe(200);
  });

  it("produto inexistente ou inativo no exterior também responde 400", async () => {
    await createZone(["US"], [{ serviceName: "DHL", maxWeightG: 1000, priceBRL: 10 }]);
    const res = await quote("nao-existe", "US");
    expect(res.status).toBe(400);
  });

  it("não chama Melhor Envio nem ViaCEP no exterior", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const product = await createProduct();
    await createZone(["US"], [{ serviceName: "DHL", maxWeightG: 1000, priceBRL: 10 }]);
    await quote(product.id, "US");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o Brasil segue no Melhor Envio: opções quoted, sem aviso de impostos e sem usar a tabela", async () => {
    const original = {
      MELHOR_ENVIO_TOKEN: env.MELHOR_ENVIO_TOKEN,
      MELHOR_ENVIO_USER_AGENT: env.MELHOR_ENVIO_USER_AGENT,
      SHIPPING_ORIGIN_CEP: env.SHIPPING_ORIGIN_CEP,
    };
    env.MELHOR_ENVIO_TOKEN = "test-token";
    env.MELHOR_ENVIO_USER_AGENT = "Teste (teste@example.com)";
    env.SHIPPING_ORIGIN_CEP = "01001000";
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("viacep.com.br")) return { ok: true, status: 200, json: async () => ({ localidade: "São Paulo", uf: "SP" }) } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: 1, name: "PAC", price: "37.79", custom_price: "35.70", custom_delivery_range: { min: 8, max: 9 }, company: { name: "Correios" } }],
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const product = await createProduct();
      await createZone(["US"], [{ serviceName: "DHL", maxWeightG: 1000, priceBRL: 10 }]);

      const res = await quote(product.id, "BR", 1, "01001000");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ mode: "domestic", requiresConfirmation: false, notice: null, unavailable: null });
      expect(res.body.options).toEqual([
        { id: expect.any(String), carrier: "Correios", service: "PAC", priceBRL: 35.7, deliveryDaysMin: 8, deliveryDaysMax: 9, kind: "quoted" },
      ]);
    } finally {
      Object.assign(env, original);
    }
  });
});
