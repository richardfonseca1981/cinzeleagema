import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase } from "./helpers";

const app = createApp();

const TOTAL_PRODUCTS = 25;
const PAGE_SIZE = 10;

let categoryId: string;
let insertedIds: string[] = [];

beforeEach(async () => {
  await cleanDatabase();

  const category = await prisma.category.create({ data: { name: "Pedras", slug: "pedras" } });
  categoryId = category.id;

  // Mesmo createdAt em todos — força o backend a depender do desempate por
  // "id" para ter ordem determinística (sem desempate, a ordem entre
  // produtos com createdAt igual não é garantida e pode variar entre as
  // duas consultas de uma mesma paginação, pulando ou repetindo peças).
  const fixedCreatedAt = new Date("2026-01-01T12:00:00.000Z");

  insertedIds = [];
  for (let i = 0; i < TOTAL_PRODUCTS; i += 1) {
    const product = await prisma.product.create({
      data: {
        name: `Peça de teste ${i}`,
        slug: `peca-paginacao-${i}`,
        price: 100,
        categoryId,
        createdAt: fixedCreatedAt,
      },
    });
    insertedIds.push(product.id);
  }
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("GET /api/products — paginação com mais itens que o tamanho da página", () => {
  it("retorna o total correto em todas as páginas", async () => {
    const res = await request(app).get(`/api/products?pageSize=${PAGE_SIZE}&page=1`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(TOTAL_PRODUCTS);
    expect(res.body.pageSize).toBe(PAGE_SIZE);
    expect(res.body.page).toBe(1);
  });

  it("percorre todas as páginas sem pular nem repetir nenhuma peça", async () => {
    const totalPages = Math.ceil(TOTAL_PRODUCTS / PAGE_SIZE);
    const seenIds: string[] = [];

    for (let page = 1; page <= totalPages; page += 1) {
      const res = await request(app).get(`/api/products?pageSize=${PAGE_SIZE}&page=${page}`);
      expect(res.status).toBe(200);
      seenIds.push(...res.body.items.map((p: { id: string }) => p.id));
    }

    // Sem duplicatas
    expect(new Set(seenIds).size).toBe(seenIds.length);
    // Sem itens faltando nem itens estranhos
    expect(new Set(seenIds)).toEqual(new Set(insertedIds));
    expect(seenIds).toHaveLength(TOTAL_PRODUCTS);
  });

  it("a última página tem o resto (25 = 2x10 + 5)", async () => {
    const res = await request(app).get(`/api/products?pageSize=${PAGE_SIZE}&page=3`);
    expect(res.body.items).toHaveLength(5);
  });

  it("a ordem é determinística: duas chamadas iguais retornam exatamente a mesma sequência", async () => {
    const first = await request(app).get(`/api/products?pageSize=${PAGE_SIZE}&page=1`);
    const second = await request(app).get(`/api/products?pageSize=${PAGE_SIZE}&page=1`);

    const firstIds = first.body.items.map((p: { id: string }) => p.id);
    const secondIds = second.body.items.map((p: { id: string }) => p.id);

    expect(firstIds).toEqual(secondIds);
  });

  it("usa id (desc) como desempate quando createdAt é igual", async () => {
    const res = await request(app).get(`/api/products?pageSize=${TOTAL_PRODUCTS}&page=1`);
    const returnedIds = res.body.items.map((p: { id: string }) => p.id);

    const expectedOrder = [...insertedIds].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(returnedIds).toEqual(expectedOrder);
  });
});
