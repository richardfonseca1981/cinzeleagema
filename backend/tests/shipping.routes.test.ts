import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/lib/env";
import { cleanDatabase, generateTestToken } from "./helpers";
import { __resetShippingQuoteCacheForTests } from "../src/lib/shipping/quoteCache";
import { __resetPostalCodeCacheForTests } from "../src/lib/shipping/viaCep";

const app = createApp();
const token = generateTestToken();

const originalShippingEnv = {
  MELHOR_ENVIO_TOKEN: env.MELHOR_ENVIO_TOKEN,
  MELHOR_ENVIO_USER_AGENT: env.MELHOR_ENVIO_USER_AGENT,
  MELHOR_ENVIO_SANDBOX: env.MELHOR_ENVIO_SANDBOX,
  SHIPPING_ORIGIN_CEP: env.SHIPPING_ORIGIN_CEP,
  SHIPPING_PACKAGING_WEIGHT_G: env.SHIPPING_PACKAGING_WEIGHT_G,
  SHIPPING_BOX_LENGTH_CM: env.SHIPPING_BOX_LENGTH_CM,
  SHIPPING_BOX_WIDTH_CM: env.SHIPPING_BOX_WIDTH_CM,
  SHIPPING_BOX_HEIGHT_CM: env.SHIPPING_BOX_HEIGHT_CM,
};

function configureMelhorEnvio() {
  env.MELHOR_ENVIO_TOKEN = "test-token";
  env.MELHOR_ENVIO_USER_AGENT = "Teste (teste@example.com)";
  env.MELHOR_ENVIO_SANDBOX = true;
  env.SHIPPING_ORIGIN_CEP = "01001000";
  env.SHIPPING_PACKAGING_WEIGHT_G = 300;
  env.SHIPPING_BOX_LENGTH_CM = 40;
  env.SHIPPING_BOX_WIDTH_CM = 30;
  env.SHIPPING_BOX_HEIGHT_CM = 25;
}

function clearMelhorEnvioConfig() {
  env.MELHOR_ENVIO_TOKEN = "";
  env.MELHOR_ENVIO_USER_AGENT = "";
  env.SHIPPING_ORIGIN_CEP = "";
}

function mockExternalFetch() {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes("viacep.com.br")) {
      return { ok: true, status: 200, json: async () => ({ localidade: "São Paulo", uf: "SP" }) } as Response;
    }
    if (url.includes("melhorenvio.com.br")) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          { id: 1, name: "PAC", price: "37.79", custom_price: "35.70", custom_delivery_range: { min: 8, max: 9 }, company: { name: "Correios" } },
        ],
      } as Response;
    }
    throw new Error(`fetch não esperado para ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

let categoryId: string;

beforeEach(async () => {
  await cleanDatabase();
  __resetShippingQuoteCacheForTests();
  __resetPostalCodeCacheForTests();

  const category = await prisma.category.create({ data: { name: "Pedras", slug: "pedras" } });
  categoryId = category.id;
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.assign(env, originalShippingEnv);
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

async function createProduct(overrides: Partial<Parameters<typeof prisma.product.create>[0]["data"]> = {}) {
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

describe("POST /api/shipping/quote — validação de entrada", () => {
  it("rejeita país que não é um código alpha-2", async () => {
    const res = await request(app)
      .post("/api/shipping/quote")
      .send({ country: "BRA", postalCode: "01001000", items: [{ productId: "x", quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it("rejeita CEP brasileiro fora do formato de 8 dígitos", async () => {
    const product = await createProduct();
    const res = await request(app)
      .post("/api/shipping/quote")
      .send({ country: "BR", postalCode: "123", items: [{ productId: product.id, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it("aceita CEP brasileiro com máscara, normalizando para 8 dígitos", async () => {
    configureMelhorEnvio();
    mockExternalFetch();
    const product = await createProduct();

    const res = await request(app)
      .post("/api/shipping/quote")
      .send({ country: "BR", postalCode: "01001-000", items: [{ productId: product.id, quantity: 1 }] });

    expect(res.status).toBe(200);
    expect(res.body.destination.postalCode).toBe("01001000");
  });

  it("rejeita quantidade fora do intervalo 1-99", async () => {
    const product = await createProduct();
    const res = await request(app)
      .post("/api/shipping/quote")
      .send({ country: "BR", postalCode: "01001000", items: [{ productId: product.id, quantity: 100 }] });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/shipping/quote — produto", () => {
  it("responde 400 quando o produto não existe", async () => {
    const res = await request(app)
      .post("/api/shipping/quote")
      .send({ country: "BR", postalCode: "01001000", items: [{ productId: "produto-inexistente", quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it("responde 400 quando o produto existe mas está inativo", async () => {
    const product = await createProduct({ active: false });
    const res = await request(app)
      .post("/api/shipping/quote")
      .send({ country: "BR", postalCode: "01001000", items: [{ productId: product.id, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it("ignora peso/preço enviados pelo cliente e usa os valores reais do banco na cotação", async () => {
    configureMelhorEnvio();
    const fetchMock = mockExternalFetch();
    const product = await createProduct({ price: 999, weightGrams: 80, sizeCm: 3 });

    const res = await request(app)
      .post("/api/shipping/quote")
      .send({
        country: "BR",
        postalCode: "01001000",
        items: [{ productId: product.id, quantity: 1, weight: 99999, price: 1 }],
      });

    expect(res.status).toBe(200);

    const melhorEnvioCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("melhorenvio.com.br"));
    const payload = JSON.parse(melhorEnvioCall![1].body);
    // Peso: 80g de peça + 300g de embalagem = 0.38kg (nunca o 99999 do cliente)
    expect(payload.products[0].weight).toBe(0.38);
    // insurance_value = preço real do produto (999), nunca o "price": 1 enviado pelo cliente
    expect(payload.products[0].insurance_value).toBe(999);
  });
});

describe("POST /api/shipping/quote — fora do Brasil (tabela do cliente)", () => {
  it("aceita país diferente de BR SEM código postal (opcional fora do Brasil); sem tabela: a combinar", async () => {
    const product = await createProduct();
    const res = await request(app)
      .post("/api/shipping/quote")
      .send({ country: "US", items: [{ productId: product.id, quantity: 1 }] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      mode: "international",
      requiresConfirmation: false,
      notice: "taxes_not_included",
      unavailable: { reason: "no_rates_configured" },
    });
  });

  it("aceita país diferente de BR com código postal vazio", async () => {
    const product = await createProduct();
    const res = await request(app)
      .post("/api/shipping/quote")
      .send({ country: "PT", postalCode: "", items: [{ productId: product.id, quantity: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("international");
  });

  it("continua exigindo CEP de 8 dígitos no Brasil: ausente ou vazio responde 400", async () => {
    const product = await createProduct();
    for (const body of [
      { country: "BR", items: [{ productId: product.id, quantity: 1 }] },
      { country: "BR", postalCode: "", items: [{ productId: product.id, quantity: 1 }] },
    ]) {
      const res = await request(app).post("/api/shipping/quote").send(body);
      expect(res.status).toBe(400);
    }
  });

  it("não chama a Melhor Envio nem o ViaCEP para país diferente de BR", async () => {
    configureMelhorEnvio();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const product = await createProduct();

    const res = await request(app)
      .post("/api/shipping/quote")
      .send({ country: "US", postalCode: "10001", items: [{ productId: product.id, quantity: 1 }] });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("international");
    expect(res.body.options).toEqual([]);
    expect(res.body.requiresConfirmation).toBe(false);
    expect(res.body.notice).toBe("taxes_not_included");
    expect(res.body.unavailable).toEqual({ reason: "no_rates_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/shipping/quote — indisponibilidade", () => {
  it("responde not_configured sem chamar fetch quando o Melhor Envio não está configurado", async () => {
    clearMelhorEnvioConfig();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const product = await createProduct();

    const res = await request(app)
      .post("/api/shipping/quote")
      .send({ country: "BR", postalCode: "01001000", items: [{ productId: product.id, quantity: 1 }] });

    expect(res.status).toBe(200);
    expect(res.body.unavailable).toEqual({ reason: "not_configured" });
    expect(res.body.options).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde incomplete_product_data quando o produto tem peso/tamanho zerados", async () => {
    configureMelhorEnvio();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const product = await createProduct({ weightGrams: 0, sizeCm: 0 });

    const res = await request(app)
      .post("/api/shipping/quote")
      .send({ country: "BR", postalCode: "01001000", items: [{ productId: product.id, quantity: 1 }] });

    expect(res.status).toBe(200);
    expect(res.body.unavailable).toEqual({ reason: "incomplete_product_data" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/shipping/quote — cache de 10 minutos", () => {
  it("não dispara nova chamada externa numa segunda requisição idêntica", async () => {
    configureMelhorEnvio();
    const fetchMock = mockExternalFetch();
    const product = await createProduct();
    const body = { country: "BR", postalCode: "01001000", items: [{ productId: product.id, quantity: 2 }] };

    const first = await request(app).post("/api/shipping/quote").send(body);
    expect(first.status).toBe(200);
    const callsAfterFirst = fetchMock.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await request(app).post("/api/shipping/quote").send(body);
    expect(second.status).toBe(200);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    expect(second.body).toEqual(first.body);
  });

  it("falha técnica (provider_error) NÃO fica em cache: tentar de novo consulta de novo e pode funcionar", async () => {
    configureMelhorEnvio();
    const product = await createProduct();
    const body = { country: "BR", postalCode: "01001000", items: [{ productId: product.id, quantity: 1 }] };

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Melhor Envio fora do ar")));
    const failed = await request(app).post("/api/shipping/quote").send(body);
    expect(failed.body.unavailable).toEqual({ reason: "provider_error" });

    mockExternalFetch();
    const retried = await request(app).post("/api/shipping/quote").send(body);
    expect(retried.body.unavailable).toBeNull();
    expect(retried.body.options).toHaveLength(1);
  });

  it("not_configured também não fica em cache", async () => {
    clearMelhorEnvioConfig();
    const product = await createProduct();
    const body = { country: "BR", postalCode: "01001000", items: [{ productId: product.id, quantity: 1 }] };

    const first = await request(app).post("/api/shipping/quote").send(body);
    expect(first.body.unavailable).toEqual({ reason: "not_configured" });

    configureMelhorEnvio();
    mockExternalFetch();
    const second = await request(app).post("/api/shipping/quote").send(body);
    expect(second.body.unavailable).toBeNull();
  });
});

describe("GET /api/shipping/postal-code/:code", () => {
  it("retorna cidade/estado em caso de sucesso do ViaCEP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ localidade: "Rio de Janeiro", uf: "RJ" }) } as Response)
    );

    const res = await request(app).get("/api/shipping/postal-code/20040-020");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ postalCode: "20040020", city: "Rio de Janeiro", state: "RJ" });
  });

  it("retorna city/state nulos (200) quando o ViaCEP falha, sem bloquear", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const res = await request(app).get("/api/shipping/postal-code/01001000");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ postalCode: "01001000", city: null, state: null });
  });

  it("rejeita CEP fora do formato de 8 dígitos", async () => {
    const res = await request(app).get("/api/shipping/postal-code/123");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/shipping/status", () => {
  it("exige autenticação", async () => {
    const res = await request(app).get("/api/shipping/status");
    expect(res.status).toBe(401);
  });

  it("nunca expõe valores, só se está configurado", async () => {
    configureMelhorEnvio();

    const res = await request(app).get("/api/shipping/status").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.domestic).toEqual({
      melhorEnvioTokenConfigured: true,
      originCepConfigured: true,
      sandbox: true,
      box: { lengthCm: 40, widthCm: 30, heightCm: 25 },
      packagingWeightG: 300,
      maxItemSizeCm: 25,
      boxFillFactor: 0.6,
    });
    expect(JSON.stringify(res.body)).not.toContain("test-token");
  });
});
