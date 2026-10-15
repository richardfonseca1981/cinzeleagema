import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";
import { __resetShippingQuoteCacheForTests } from "../src/lib/shipping/quoteCache";

const app = createApp();
const auth = { Authorization: `Bearer ${generateTestToken()}` };

let categoryId: string;

beforeEach(async () => {
  await cleanDatabase();
  __resetShippingQuoteCacheForTests();
  categoryId = (await prisma.category.create({ data: { name: "Pedras", slug: "pedras" } })).id;
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

const createZone = (body: Record<string, unknown>) => request(app).post("/api/admin/shipping/zones").set(auth).send(body);
const createRate = (zoneId: string, body: Record<string, unknown>) =>
  request(app).post(`/api/admin/shipping/zones/${zoneId}/rates`).set(auth).send(body);

const validRate = { serviceName: "DHL", maxWeightG: 1000, priceBRL: 120.5, deliveryDaysMin: 5, deliveryDaysMax: 8 };

describe("autenticação", () => {
  it.each([
    ["get", "/api/admin/shipping/zones"],
    ["post", "/api/admin/shipping/zones"],
    ["patch", "/api/admin/shipping/zones/x"],
    ["delete", "/api/admin/shipping/zones/x"],
    ["post", "/api/admin/shipping/zones/x/rates"],
    ["patch", "/api/admin/shipping/zones/x/rates/y"],
    ["delete", "/api/admin/shipping/zones/x/rates/y"],
    ["post", "/api/admin/shipping/simulate"],
  ] as const)("%s %s sem token responde 401", async (method, url) => {
    const res = await request(app)[method](url).send({});
    expect(res.status).toBe(401);
  });
});

describe("zonas", () => {
  it("cria, lista (com faixas), edita e remove", async () => {
    const created = await createZone({ name: "América do Norte", countries: ["us", "CA", "us"] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "América do Norte", countries: ["US", "CA"], active: true, position: 0, rates: [] });

    await createRate(created.body.id, validRate);

    const list = await request(app).get("/api/admin/shipping/zones").set(auth);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].rates[0]).toMatchObject({ serviceName: "DHL", maxWeightG: 1000, priceBRL: 120.5 });

    const edited = await request(app)
      .patch(`/api/admin/shipping/zones/${created.body.id}`)
      .set(auth)
      .send({ name: "Norte", countries: ["US"], active: false, position: 3 });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: "Norte", countries: ["US"], active: false, position: 3 });

    const removed = await request(app).delete(`/api/admin/shipping/zones/${created.body.id}`).set(auth);
    expect(removed.status).toBe(204);
    expect(await prisma.shippingZone.count()).toBe(0);
    expect(await prisma.shippingRate.count()).toBe(0); // cascata
  });

  it("editar ou remover zona inexistente responde 404", async () => {
    expect((await request(app).patch("/api/admin/shipping/zones/nao-existe").set(auth).send({ name: "x" })).status).toBe(404);
    expect((await request(app).delete("/api/admin/shipping/zones/nao-existe").set(auth)).status).toBe(404);
  });

  it.each([
    [{ countries: ["US"] }, "Informe o nome da zona"],
    [{ name: "  ", countries: ["US"] }, "Informe o nome da zona"],
    [{ name: "Z" }, "Escolha ao menos um país"],
    [{ name: "Z", countries: [] }, "Escolha ao menos um país"],
    [{ name: "Z", countries: ["XX"] }, "País inválido"],
    [{ name: "Z", countries: ["USA"] }, "País inválido"],
    [{ name: "Z", countries: ["BR"] }, "O Brasil não entra na tabela internacional"],
    [{ name: "Z", countries: ["br"] }, "O Brasil não entra na tabela internacional"],
    [{ name: "Z", countries: ["US", "BR"] }, "O Brasil não entra na tabela internacional"],
    [{ name: "Z", countries: ["US"], position: -1 }, "A posição não pode ser negativa"],
  ])("rejeita %j com 400", async (body, message) => {
    const res = await createZone(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(message);
  });

  it("o mesmo país em duas zonas ATIVAS responde 409 dizendo qual zona já o contém", async () => {
    await createZone({ name: "Zona A", countries: ["PT", "ES"] });

    const res = await createZone({ name: "Zona B", countries: ["IT", "ES"] });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('O país Espanha (ES) já está na zona ativa "Zona A"');
  });

  it("zona inativa não conflita; ativar uma zona que conflita responde 409; editar a própria zona não conflita consigo", async () => {
    const a = await createZone({ name: "Zona A", countries: ["PT"] });
    const inactive = await createZone({ name: "Zona B", countries: ["PT"], active: false });
    expect(inactive.status).toBe(201);

    const activate = await request(app).patch(`/api/admin/shipping/zones/${inactive.body.id}`).set(auth).send({ active: true });
    expect(activate.status).toBe(409);
    expect(activate.body.error).toContain('"Zona A"');

    const rename = await request(app).patch(`/api/admin/shipping/zones/${a.body.id}`).set(auth).send({ name: "Zona A2", countries: ["PT", "AR"] });
    expect(rename.status).toBe(200);

    const addCountry = await request(app).patch(`/api/admin/shipping/zones/${inactive.body.id}`).set(auth).send({ countries: ["AR"] });
    expect(addCountry.status).toBe(200); // continua inativa: sem conflito
  });

  it("liberar o país (desativar ou remover a zona) permite usá-lo em outra", async () => {
    const a = await createZone({ name: "Zona A", countries: ["PT"] });
    await request(app).patch(`/api/admin/shipping/zones/${a.body.id}`).set(auth).send({ active: false });
    expect((await createZone({ name: "Zona B", countries: ["PT"] })).status).toBe(201);
  });
});

describe("faixas", () => {
  async function zoneId() {
    return (await createZone({ name: "Zona", countries: ["US"] })).body.id as string;
  }

  it("cria, edita e remove uma faixa", async () => {
    const id = await zoneId();
    const created = await createRate(id, validRate);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...validRate, zoneId: id, active: true });

    const edited = await request(app)
      .patch(`/api/admin/shipping/zones/${id}/rates/${created.body.id}`)
      .set(auth)
      .send({ priceBRL: 99.9, maxWeightG: 2000, deliveryDaysMin: null, deliveryDaysMax: null, active: false });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ priceBRL: 99.9, maxWeightG: 2000, deliveryDaysMin: null, deliveryDaysMax: null, active: false });

    const removed = await request(app).delete(`/api/admin/shipping/zones/${id}/rates/${created.body.id}`).set(auth);
    expect(removed.status).toBe(204);
    expect(await prisma.shippingRate.count()).toBe(0);
  });

  it("prazos são opcionais e preço zero é aceito", async () => {
    const id = await zoneId();
    const res = await createRate(id, { serviceName: "Grátis", maxWeightG: 500, priceBRL: 0 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ priceBRL: 0, deliveryDaysMin: null, deliveryDaysMax: null });
  });

  it.each([
    [{ ...validRate, serviceName: " " }, "Informe o nome do serviço"],
    [{ ...validRate, maxWeightG: 0 }, "maior que zero"],
    [{ ...validRate, maxWeightG: -5 }, "maior que zero"],
    [{ ...validRate, maxWeightG: 10.5 }, "número inteiro de gramas"],
    [{ ...validRate, maxWeightG: "mil" }, "O peso deve ser um número"],
    [{ ...validRate, priceBRL: -1 }, "O preço não pode ser negativo"],
    [{ ...validRate, priceBRL: 10.123 }, "no máximo 2 casas decimais"],
    [{ ...validRate, priceBRL: "caro" }, "O preço deve ser um número"],
    [{ ...validRate, deliveryDaysMin: 9, deliveryDaysMax: 3 }, "O prazo mínimo não pode ser maior que o prazo máximo"],
    [{ ...validRate, deliveryDaysMin: 2.5 }, "número inteiro de dias"],
    [{ ...validRate, deliveryDaysMin: -1 }, "não pode ser negativo"],
  ])("rejeita %j com 400", async (body, message) => {
    const id = await zoneId();
    const res = await createRate(id, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(message);
  });

  it("aceita preço com 2 casas como 0.1 + 0.2 sem erro de ponto flutuante", async () => {
    const id = await zoneId();
    const res = await createRate(id, { ...validRate, priceBRL: 10.1 });
    expect(res.status).toBe(201);
    expect(res.body.priceBRL).toBe(10.1);
  });

  it("(zona, serviço, faixa) repetida responde 409, na criação e na edição", async () => {
    const id = await zoneId();
    await createRate(id, validRate);

    const dup = await createRate(id, validRate);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('Já existe uma faixa do serviço "DHL" até 1000 g nesta zona');

    const other = await createRate(id, { ...validRate, maxWeightG: 2000 });
    const collide = await request(app).patch(`/api/admin/shipping/zones/${id}/rates/${other.body.id}`).set(auth).send({ maxWeightG: 1000 });
    expect(collide.status).toBe(409);

    // outro serviço, ou a mesma faixa em outra zona, é permitido
    expect((await createRate(id, { ...validRate, serviceName: "Correios" })).status).toBe(201);
    const zone2 = (await createZone({ name: "Zona 2", countries: ["PT"] })).body.id;
    expect((await createRate(zone2, validRate)).status).toBe(201);
  });

  it("na edição, prazo min > max (inclusive contra o valor já salvo) responde 400", async () => {
    const id = await zoneId();
    const created = await createRate(id, validRate); // 5..8
    const res = await request(app).patch(`/api/admin/shipping/zones/${id}/rates/${created.body.id}`).set(auth).send({ deliveryDaysMin: 20 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("O prazo mínimo");
  });

  it("faixa de outra zona ou inexistente responde 404", async () => {
    const id = await zoneId();
    const zone2 = (await createZone({ name: "Zona 2", countries: ["PT"] })).body.id;
    const rate = await createRate(zone2, validRate);

    expect((await request(app).patch(`/api/admin/shipping/zones/${id}/rates/${rate.body.id}`).set(auth).send({ priceBRL: 1 })).status).toBe(404);
    expect((await request(app).delete(`/api/admin/shipping/zones/${id}/rates/nao-existe`).set(auth)).status).toBe(404);
    expect((await createRate("nao-existe", validRate)).status).toBe(404);
  });
});

describe("limpeza do cache de cotação", () => {
  it("criar, editar e remover zonas/faixas descarta a cotação internacional em cache", async () => {
    const product = await prisma.product.create({
      data: { name: "Ametista", slug: `a-${Math.random()}`, price: 100, weightGrams: 80, sizeCm: 3, categoryId },
    });
    const quote = () =>
      request(app).post("/api/shipping/quote").send({ country: "US", items: [{ productId: product.id, quantity: 1 }] });

    expect((await quote()).body.unavailable).toEqual({ reason: "no_rates_configured" }); // entra no cache

    const zone = await createZone({ name: "Zona", countries: ["US"] });
    expect((await quote()).body.unavailable).toEqual({ reason: "no_rates_configured" }); // zona sem tarifa (cache limpo, sem tarifa)

    const rate = await createRate(zone.body.id, { serviceName: "DHL", maxWeightG: 1000, priceBRL: 100 });
    expect((await quote()).body.options[0].priceBRL).toBe(100); // criação de faixa limpou

    await request(app).patch(`/api/admin/shipping/zones/${zone.body.id}/rates/${rate.body.id}`).set(auth).send({ priceBRL: 150 });
    expect((await quote()).body.options[0].priceBRL).toBe(150); // edição de faixa limpou

    await request(app).patch(`/api/admin/shipping/zones/${zone.body.id}`).set(auth).send({ active: false });
    expect((await quote()).body.unavailable).toEqual({ reason: "no_rates_configured" }); // edição de zona limpou

    await request(app).patch(`/api/admin/shipping/zones/${zone.body.id}`).set(auth).send({ active: true });
    expect((await quote()).body.options[0].priceBRL).toBe(150);

    await request(app).delete(`/api/admin/shipping/zones/${zone.body.id}/rates/${rate.body.id}`).set(auth);
    expect((await quote()).body.unavailable).toEqual({ reason: "no_rates_configured" }); // remoção de faixa limpou

    await request(app).delete(`/api/admin/shipping/zones/${zone.body.id}`).set(auth);
    expect((await quote()).body.unavailable).toEqual({ reason: "no_rates_configured" }); // remoção de zona limpou
  });
});

describe("POST /api/admin/shipping/simulate", () => {
  const simulate = (body: Record<string, unknown>) => request(app).post("/api/admin/shipping/simulate").set(auth).send(body);

  it("devolve opções definitivas com o aviso de impostos", async () => {
    const zone = await createZone({ name: "Zona", countries: ["US"] });
    await createRate(zone.body.id, { serviceName: "DHL", maxWeightG: 500, priceBRL: 100, deliveryDaysMin: 4, deliveryDaysMax: 6 });
    await createRate(zone.body.id, { serviceName: "DHL", maxWeightG: 2000, priceBRL: 300 });

    const res = await simulate({ country: "us", weightGrams: 501 });

    expect(res.status).toBe(200);
    expect(res.body.weightGrams).toBe(501);
    expect(res.body.result).toMatchObject({ mode: "international", notice: "taxes_not_included", requiresConfirmation: false, unavailable: null });
    expect(res.body.result.options).toHaveLength(1);
    expect(res.body.result.options[0]).toMatchObject({ service: "DHL", priceBRL: 300, kind: "quoted" });
  });

  it("no limite exato usa a faixa; acima de todas, over_limits; país sem zona, no_rates_configured", async () => {
    const zone = await createZone({ name: "Zona", countries: ["US"] });
    await createRate(zone.body.id, { serviceName: "DHL", maxWeightG: 500, priceBRL: 100 });

    expect((await simulate({ country: "US", weightGrams: 500 })).body.result.options[0].priceBRL).toBe(100);
    expect((await simulate({ country: "US", weightGrams: 501 })).body.result.unavailable).toEqual({ reason: "over_limits" });
    const noZone = await simulate({ country: "FR", weightGrams: 100 });
    expect(noZone.body.result).toMatchObject({ unavailable: { reason: "no_rates_configured" }, notice: "taxes_not_included" });
  });

  it.each([
    [{ country: "BR", weightGrams: 100 }, "O Brasil não entra"],
    [{ country: "XX", weightGrams: 100 }, "País inválido"],
    [{ weightGrams: 100 }, "Informe o país"],
    [{ country: "US", weightGrams: 0 }, "maior que zero"],
    [{ country: "US", weightGrams: 10.5 }, "número inteiro de gramas"],
    [{ country: "US" }, "Informe o peso em gramas"],
  ])("rejeita %j com 400", async (body, message) => {
    const res = await simulate(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(message);
  });
});

describe("GET /api/shipping/status", () => {
  it("resume a tabela internacional para o admin", async () => {
    await createZone({ name: "A", countries: ["US", "CA"] });
    await createZone({ name: "B", countries: ["PT"], active: false });

    const res = await request(app).get("/api/shipping/status").set(auth);

    expect(res.body.international).toEqual({ zones: 2, activeZones: 1, activeCountries: 2 });
  });
});
