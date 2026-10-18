import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase } from "./helpers";
import { splitWindow } from "../src/lib/productSort";

const app = createApp();

// 12 peças ativas (idx 0-11) com combinações de preço nulo/0 e tamanho/peso 0
// ("não informado"), mais 2 peças INATIVAS (idx 12-13) só para provar que o
// filtro active=true continua funcionando junto com sort. sortOrder de cada
// peça é uma permutação (não coincide com o índice nem com a ordem de
// createdAt) para que os testes não passem "por acidente".
const FIXTURES = [
  { price: 50, sizeCm: 2.0, weightGrams: 100, sortOrder: 5, active: true },
  { price: null, sizeCm: 0, weightGrams: 0, sortOrder: 2, active: true },
  { price: 30, sizeCm: 5.0, weightGrams: 300, sortOrder: 9, active: true },
  { price: 0, sizeCm: 0, weightGrams: 50, sortOrder: 1, active: true },
  { price: 80, sizeCm: 1.0, weightGrams: 0, sortOrder: 7, active: true },
  { price: null, sizeCm: 3.0, weightGrams: 200, sortOrder: 4, active: true },
  { price: 20, sizeCm: 0, weightGrams: 0, sortOrder: 11, active: true },
  { price: 100, sizeCm: 4.0, weightGrams: 400, sortOrder: 0, active: true },
  { price: 10, sizeCm: 0, weightGrams: 150, sortOrder: 8, active: true },
  { price: 0, sizeCm: 2.5, weightGrams: 0, sortOrder: 3, active: true },
  { price: 60, sizeCm: 6.0, weightGrams: 500, sortOrder: 10, active: true },
  { price: 40, sizeCm: 0.5, weightGrams: 250, sortOrder: 6, active: true },
  { price: 15, sizeCm: 1.0, weightGrams: 20, sortOrder: 12, active: false },
  { price: 25, sizeCm: 1.0, weightGrams: 20, sortOrder: 13, active: false },
];

const TOTAL_ACTIVE = 12;
const TOTAL_ALL = FIXTURES.length;
const PAGE_SIZE = 2;

let ids: string[] = [];

beforeEach(async () => {
  await cleanDatabase();

  const category = await prisma.category.create({ data: { name: "Pedras", slug: "pedras" } });

  // idx 0 e 1 com o MESMO createdAt (testa o desempate de "newest" por
  // sortOrder/id quando createdAt empata); os demais crescem 1 min por índice.
  const base = new Date("2026-01-01T00:00:00.000Z");
  const createdAtFor = (idx: number) => new Date(base.getTime() + Math.max(idx - 1, 0) * 60_000);

  ids = [];
  for (let idx = 0; idx < FIXTURES.length; idx += 1) {
    const f = FIXTURES[idx];
    const product = await prisma.product.create({
      data: {
        name: `Peça ordenação ${idx}`,
        slug: `peca-sort-${idx}`,
        categoryId: category.id,
        price: f.price,
        sizeCm: f.sizeCm,
        weightGrams: f.weightGrams,
        sortOrder: f.sortOrder,
        active: f.active,
        createdAt: createdAtFor(idx),
      },
    });
    ids.push(product.id);
  }
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

// Índices esperados (ver cálculo no corpo da tarefa) para cada ordenação,
// considerando só as 12 peças ativas.
const EXPECTED_INDEX_ORDER: Record<string, number[]> = {
  default: [7, 3, 1, 9, 5, 0, 11, 4, 8, 2, 10, 6],
  newest: [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  price_asc: [3, 9, 8, 6, 2, 11, 0, 10, 4, 7, 1, 5],
  price_desc: [7, 4, 10, 0, 11, 2, 6, 8, 3, 9, 1, 5],
  size_desc: [10, 2, 7, 5, 9, 0, 4, 11, 3, 1, 8, 6],
  size_asc: [11, 4, 0, 9, 5, 7, 2, 10, 3, 1, 8, 6],
  weight_desc: [10, 7, 2, 11, 5, 8, 0, 3, 1, 9, 4, 6],
  weight_asc: [3, 0, 8, 5, 11, 2, 7, 10, 1, 9, 4, 6],
};

describe.each(Object.keys(EXPECTED_INDEX_ORDER))("GET /api/products?sort=%s", (sort) => {
  function expectedIds() {
    return EXPECTED_INDEX_ORDER[sort].map((idx) => ids[idx]);
  }

  it("retorna a ordem esperada (peça sem preço/tamanho/peso informado tratada corretamente)", async () => {
    const res = await request(app).get(`/api/products?active=true&sort=${sort}&pageSize=${TOTAL_ACTIVE}&page=1`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: { id: string }) => p.id)).toEqual(expectedIds());
  });

  it("total correto com active=true + sort", async () => {
    const res = await request(app).get(`/api/products?active=true&sort=${sort}&pageSize=${TOTAL_ACTIVE}&page=1`);
    expect(res.body.total).toBe(TOTAL_ACTIVE);
  });

  it("percorre páginas de tamanho 2 sem pular nem repetir peças, inclusive na fronteira dos zeros/nulos", async () => {
    const totalPages = Math.ceil(TOTAL_ACTIVE / PAGE_SIZE);
    const seenIds: string[] = [];

    for (let page = 1; page <= totalPages; page += 1) {
      const res = await request(app).get(`/api/products?active=true&sort=${sort}&pageSize=${PAGE_SIZE}&page=${page}`);
      expect(res.status).toBe(200);
      seenIds.push(...res.body.items.map((p: { id: string }) => p.id));
    }

    expect(seenIds).toEqual(expectedIds());
    expect(new Set(seenIds).size).toBe(TOTAL_ACTIVE);
  });
});

describe("GET /api/products?sort — validação e composição com outros filtros", () => {
  it("sort inválido retorna 400", async () => {
    const res = await request(app).get("/api/products?sort=valor_invalido");
    expect(res.status).toBe(400);
  });

  it("sem sort cai no default (ordem do admin)", async () => {
    const res = await request(app).get(`/api/products?active=true&pageSize=${TOTAL_ACTIVE}&page=1`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: { id: string }) => p.id)).toEqual(
      EXPECTED_INDEX_ORDER.default.map((idx) => ids[idx])
    );
  });

  it("sort soma com active (sem active, total inclui as peças inativas)", async () => {
    const res = await request(app).get(`/api/products?sort=price_asc&pageSize=${TOTAL_ALL}&page=1`);
    expect(res.body.total).toBe(TOTAL_ALL);
  });
});

describe("splitWindow (função pura)", () => {
  it("divide a janela inteiramente dentro do primeiro conjunto", () => {
    expect(splitWindow(0, 2, 5)).toEqual({ firstSkip: 0, firstTake: 2, secondSkip: 0, secondTake: 0 });
  });

  it("divide a janela inteiramente dentro do segundo conjunto", () => {
    expect(splitWindow(7, 2, 5)).toEqual({ firstSkip: 5, firstTake: 0, secondSkip: 2, secondTake: 2 });
  });

  it("divide a janela na fronteira entre os dois conjuntos", () => {
    expect(splitWindow(4, 2, 5)).toEqual({ firstSkip: 4, firstTake: 1, secondSkip: 0, secondTake: 1 });
  });

  it("primeiro conjunto vazio: tudo cai no segundo", () => {
    expect(splitWindow(1, 3, 0)).toEqual({ firstSkip: 0, firstTake: 0, secondSkip: 1, secondTake: 3 });
  });

  it("skip além dos dois conjuntos: nada a devolver", () => {
    expect(splitWindow(100, 2, 5)).toEqual({ firstSkip: 5, firstTake: 0, secondSkip: 95, secondTake: 2 });
  });
});
