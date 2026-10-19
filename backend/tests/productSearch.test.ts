import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { escapeLikePattern } from "../src/utils/escapeLike";
import { filterProductIdsBySearch, productMatchesSearch, splitSearchWords } from "../src/lib/productSearch";
import { cleanDatabase } from "./helpers";

const app = createApp();

// Mesmo createdAt em todos: a ordem só é determinística graças ao desempate por id.
const FIXED_CREATED_AT = new Date("2026-01-01T12:00:00.000Z");

let categoryA: string;
let categoryB: string;

async function makeProduct(
  name: string,
  slug: string,
  extra: { sku?: string; nameEn?: string; price?: number; categoryId?: string; active?: boolean } = {}
) {
  return prisma.product.create({
    data: {
      name,
      slug,
      price: extra.price ?? 100,
      sku: extra.sku,
      nameEn: extra.nameEn,
      active: extra.active ?? true,
      categoryId: extra.categoryId ?? categoryA,
      createdAt: FIXED_CREATED_AT,
    },
  });
}

beforeEach(async () => {
  await cleanDatabase();
  categoryA = (await prisma.category.create({ data: { name: "Brutas", slug: "brutas" } })).id;
  categoryB = (await prisma.category.create({ data: { name: "Polidas", slug: "polidas" } })).id;
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("escapeLikePattern (função pura)", () => {
  it("escapa %, _ e a própria barra invertida", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("não altera texto comum", () => {
    expect(escapeLikePattern("Esmeralda Colombiana")).toBe("Esmeralda Colombiana");
  });
});

describe("GET /api/products?q= — busca por texto no servidor", () => {
  it("encontra por parte do nome, sem diferenciar maiúsculas de minúsculas e com acento", async () => {
    await makeProduct("Esmeralda Colombiana", "esmeralda");
    await makeProduct("Ametista Uruguaia", "ametista");
    await makeProduct("Peça de Quartzo", "quartzo");

    for (const q of ["esmer", "ESMER", "Esmeralda Col"]) {
      const res = await request(app).get(`/api/products?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
      expect(res.body.items.map((p: { name: string }) => p.name)).toEqual(["Esmeralda Colombiana"]);
    }
    const accent = await request(app).get(`/api/products?q=${encodeURIComponent("PEÇA")}`);
    expect(accent.body.items.map((p: { name: string }) => p.name)).toEqual(["Peça de Quartzo"]);
  });

  it("também encontra pelo SKU", async () => {
    await makeProduct("Sem relação", "a", { sku: "ESM-0042" });
    await makeProduct("Outra peça", "b", { sku: "AME-0001" });

    const res = await request(app).get("/api/products?q=esm-00");
    expect(res.body.items.map((p: { slug: string }) => p.slug)).toEqual(["a"]);
  });

  it("total e páginas refletem o filtro (não o total geral)", async () => {
    for (let i = 0; i < 12; i++) await makeProduct(`Quartzo ${i}`, `quartzo-${i}`);
    for (let i = 0; i < 30; i++) await makeProduct(`Ametista ${i}`, `ametista-${i}`);

    const page1 = await request(app).get("/api/products?q=quartzo&pageSize=5&page=1");
    expect(page1.body.total).toBe(12);
    expect(page1.body.items).toHaveLength(5);
    const page3 = await request(app).get("/api/products?q=quartzo&pageSize=5&page=3");
    expect(page3.body.items).toHaveLength(2); // 12 = 5 + 5 + 2
    expect(page3.body.total).toBe(12);
  });

  it("ordem estável: percorrer as páginas da busca não pula nem repete peças", async () => {
    for (let i = 0; i < 23; i++) await makeProduct(`Quartzo ${i}`, `quartzo-${i}`);

    const seen: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await request(app).get(`/api/products?q=quartzo&pageSize=10&page=${page}`);
      seen.push(...res.body.items.map((p: { id: string }) => p.id));
    }
    expect(seen).toHaveLength(23);
    expect(new Set(seen).size).toBe(23);

    const again = await request(app).get("/api/products?q=quartzo&pageSize=10&page=1");
    expect(again.body.items.map((p: { id: string }) => p.id)).toEqual(seen.slice(0, 10));
  });

  it("curingas do LIKE são tratados como texto literal ('%' e '_' não casam com tudo)", async () => {
    await makeProduct("Peça normal", "n");
    await makeProduct("Peça 100% pura", "p");
    await makeProduct("Peça_com_underline", "u");

    const pct = await request(app).get(`/api/products?q=${encodeURIComponent("%")}`);
    expect(pct.body.items.map((p: { slug: string }) => p.slug)).toEqual(["p"]);
    const under = await request(app).get(`/api/products?q=${encodeURIComponent("_")}`);
    expect(under.body.items.map((p: { slug: string }) => p.slug)).toEqual(["u"]);
    const pct100 = await request(app).get(`/api/products?q=${encodeURIComponent("100%")}`);
    expect(pct100.body.total).toBe(1);
  });

  it("combina com categoria e status (active)", async () => {
    await makeProduct("Quartzo A", "qa", { categoryId: categoryA });
    await makeProduct("Quartzo B", "qb", { categoryId: categoryB });
    await makeProduct("Quartzo C", "qc", { categoryId: categoryA, active: false });

    const byCategory = await request(app).get(`/api/products?q=quartzo&categoryId=${categoryA}`);
    expect(byCategory.body.total).toBe(2);
    const inactive = await request(app).get(`/api/products?q=quartzo&categoryId=${categoryA}&active=false`);
    expect(inactive.body.items.map((p: { slug: string }) => p.slug)).toEqual(["qc"]);
  });

  it("sem resultado: total 0 e lista vazia", async () => {
    await makeProduct("Quartzo", "q");
    const res = await request(app).get("/api/products?q=zzzz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], total: 0 });
  });

  it("q em branco ou só com espaços é ignorado (igual a não enviar q)", async () => {
    await makeProduct("A", "a");
    await makeProduct("B", "b");
    for (const q of ["", "%20%20"]) {
      const res = await request(app).get(`/api/products?q=${q}`);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
    }
  });

  it("q maior que 100 caracteres é rejeitado (validação Zod)", async () => {
    const res = await request(app).get(`/api/products?q=${"a".repeat(101)}`);
    expect(res.status).toBe(400);
  });

  it("várias palavras em qualquer ordem, com acento, sem acento e com hífen", async () => {
    await makeProduct("Água-marinha Grande", "agua-marinha-grande", { sku: "AGM-01" });
    await makeProduct("Topázio Imperial", "topazio-imperial");
    await makeProduct("Outra peça qualquer", "outra-generica");

    for (const q of ["agua marinha", "marinha agua", "água-marinha", "AGUA-MARINHA grande", "grande agua"]) {
      const res = await request(app).get(`/api/products?q=${encodeURIComponent(q)}`);
      expect(res.body.items.map((p: { slug: string }) => p.slug)).toEqual(["agua-marinha-grande"]);
    }

    for (const q of ["topazio", "TOPÁZIO", "topázio imperial"]) {
      const res = await request(app).get(`/api/products?q=${encodeURIComponent(q)}`);
      expect(res.body.items.map((p: { slug: string }) => p.slug)).toEqual(["topazio-imperial"]);
    }
  });

  it("também encontra pelo nome em inglês (nameEn)", async () => {
    await makeProduct("Pedra sem tradução legível", "pedra-en", { nameEn: "Blue Aquamarine Stone" });
    await makeProduct("Outra peça", "outra-en");

    const res = await request(app).get(`/api/products?q=${encodeURIComponent("aquamarine")}`);
    expect(res.body.items.map((p: { slug: string }) => p.slug)).toEqual(["pedra-en"]);

    // Uma palavra no nome em português, outra só no nome em inglês — ainda
    // precisa casar (não precisa ser o MESMO campo para todas as palavras).
    const mixed = await request(app).get(`/api/products?q=${encodeURIComponent("pedra aquamarine")}`);
    expect(mixed.body.items.map((p: { slug: string }) => p.slug)).toEqual(["pedra-en"]);
  });

  it("combina busca com categoria, active e ordenação por preço", async () => {
    await makeProduct("Quartzo Rosa", "quartzo-rosa", { categoryId: categoryA, price: 300 });
    await makeProduct("Quartzo Fumê", "quartzo-fume", { categoryId: categoryA, price: 100 });
    await makeProduct("Quartzo Inativo", "quartzo-inativo", { categoryId: categoryA, active: false, price: 50 });
    await makeProduct("Quartzo Outra Categoria", "quartzo-b", { categoryId: categoryB, price: 10 });

    const res = await request(app).get(
      `/api/products?q=quartzo&categoryId=${categoryA}&active=true&sort=price_asc`
    );
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((p: { slug: string }) => p.slug)).toEqual(["quartzo-fume", "quartzo-rosa"]);
  });

  it("paginação com busca acentuada: sem pular nem repetir peças e total correto", async () => {
    for (let i = 0; i < 17; i++) await makeProduct(`Ágata ${i}`, `agata-${i}`);
    for (let i = 0; i < 5; i++) await makeProduct(`Outra peça ${i}`, `outra-pec-${i}`);

    const seen: string[] = [];
    for (let page = 1; page <= 2; page++) {
      const res = await request(app).get(`/api/products?q=agata&pageSize=10&page=${page}`);
      expect(res.body.total).toBe(17);
      seen.push(...res.body.items.map((p: { id: string }) => p.id));
    }
    expect(seen).toHaveLength(17);
    expect(new Set(seen).size).toBe(17);
  });
});

describe("productSearch (funções puras)", () => {
  it("splitSearchWords normaliza acento, hífen, maiúsculas e espaços extras", () => {
    expect(splitSearchWords("Água-Marinha")).toEqual(["agua", "marinha"]);
    expect(splitSearchWords("  Topázio   Imperial ")).toEqual(["topazio", "imperial"]);
    expect(splitSearchWords("")).toEqual([]);
    expect(splitSearchWords("   ")).toEqual([]);
  });

  it("productMatchesSearch exige todas as palavras, em qualquer um dos campos", () => {
    const product = { name: "Água-marinha Grande", nameEn: "Blue Aquamarine", sku: "AGM-01" };
    expect(productMatchesSearch(product, ["agua", "marinha"])).toBe(true);
    expect(productMatchesSearch(product, ["marinha", "agua"])).toBe(true);
    // "aquamarine" só existe no nameEn, "agua" só no name — precisa achar as
    // duas, cada uma em um campo diferente.
    expect(productMatchesSearch(product, ["aquamarine", "agua"])).toBe(true);
    expect(productMatchesSearch(product, ["zzzz"])).toBe(false);
    expect(productMatchesSearch(product, [])).toBe(true);
  });

  it("productMatchesSearch trata %, _ e \\ como texto literal", () => {
    expect(productMatchesSearch({ name: "Peça 100% pura" }, ["100%"])).toBe(true);
    expect(productMatchesSearch({ name: "Peça_com_underline" }, ["_"])).toBe(true);
    expect(productMatchesSearch({ name: "a\\b" }, ["a\\b"])).toBe(true);
  });

  it("filterProductIdsBySearch devolve só os ids que casam, e todos quando q é vazio", () => {
    const products = [
      { id: "1", name: "Água-marinha", nameEn: null, sku: null },
      { id: "2", name: "Topázio", nameEn: null, sku: null },
    ];
    expect(filterProductIdsBySearch(products, "agua")).toEqual(["1"]);
    expect(filterProductIdsBySearch(products, "")).toEqual(["1", "2"]);
  });
});

describe("GET /api/products sem q — comportamento anterior intacto (catálogo público)", () => {
  beforeEach(async () => {
    for (let i = 0; i < 25; i++) await makeProduct(`Peça ${i}`, `peca-${i}`);
  });

  it("sem q: mesmo total, mesma ordem e mesmo formato de resposta de sempre", async () => {
    const res = await request(app).get("/api/products?pageSize=10&page=2");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["items", "page", "pageSize", "total"]);
    expect(res.body).toMatchObject({ total: 25, page: 2, pageSize: 10 });

    // Ordem: sortOrder asc, id asc
    const all = await prisma.product.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    expect(res.body.items.map((p: { id: string }) => p.id)).toEqual(all.slice(10, 20).map((p) => p.id));
  });

  it("padrão continua pageSize 20; máximo continua 100 (101 → 400)", async () => {
    expect((await request(app).get("/api/products")).body).toMatchObject({ pageSize: 20 });
    expect((await request(app).get("/api/products?pageSize=100")).status).toBe(200);
    expect((await request(app).get("/api/products?pageSize=101")).status).toBe(400);
  });
});
