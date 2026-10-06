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

describe("POST /api/shipping/quote — caixa fixa", () => {
  async function quoteBody(productId: string, quantity = 1) {
    return request(app)
      .post("/api/shipping/quote")
      .send({ country: "BR", postalCode: "01001000", items: [{ productId, quantity }] });
  }

  it("envia um único volume com a caixa fixa, peso total e seguro somado", async () => {
    configureMelhorEnvio();
    const fetchMock = mockExternalFetch();
    const product = await createProduct({ price: 100, weightGrams: 80, sizeCm: 3 });

    const res = await quoteBody(product.id, 3);

    expect(res.status).toBe(200);
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("melhorenvio.com.br"));
    const payload = JSON.parse(call![1].body);
    expect(payload.products).toEqual([
      { id: "pedido", length: 40, width: 30, height: 25, weight: 0.54, insurance_value: 300, quantity: 1 },
    ]);
  });

  it("campos antigos de embalagem preenchidos não mudam o resultado", async () => {
    configureMelhorEnvio();
    const fetchMock = mockExternalFetch();
    const plain = await createProduct({ weightGrams: 80, sizeCm: 3 });
    const legacy = await createProduct({ weightGrams: 80, sizeCm: 3, packageLengthCm: 10, packageWidthCm: 10, packageHeightCm: 10 });

    await quoteBody(plain.id);
    await quoteBody(legacy.id);

    const bodies = fetchMock.mock.calls
      .filter((c) => String(c[0]).includes("melhorenvio.com.br"))
      .map((c) => JSON.parse(c[1].body).products);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual(bodies[1]);
  });

  it("responde over_limits sem chamar o provedor para peça maior que 25 cm", async () => {
    configureMelhorEnvio();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const product = await createProduct({ sizeCm: 26 });

    const res = await quoteBody(product.id);

    expect(res.status).toBe(200);
    expect(res.body.unavailable).toEqual({ reason: "over_limits" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde over_limits quando o pedido ocupa mais de 60% da caixa", async () => {
    configureMelhorEnvio();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const product = await createProduct({ sizeCm: 10 });

    const res = await quoteBody(product.id, 19);

    expect(res.body.unavailable).toEqual({ reason: "over_limits" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

