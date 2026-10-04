import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { runPromote, type Deps } from "../src/scripts/promoteFormasToCategory";
import { cleanDatabase, generateTestToken } from "./helpers";
import { seedOldLayout } from "./formasFixture";

// Estado final DEPOIS da migração, visto pela API (banco de teste real).

const app = createApp();
const token = generateTestToken();

function localDeps(): Deps {
  return {
    prisma,
    database: "localhost:5432/test",
    isLocalhost: true,
    r2Configured: false,
    putR2: async () => undefined,
    getR2: async () => Buffer.alloc(0),
    writeLocalFile: (name) => `/tmp/${name}`,
    readLocalFile: () => "",
    now: () => new Date("2026-10-05T12:00:00Z"),
    log: () => undefined,
  };
}

let data: Awaited<ReturnType<typeof seedOldLayout>>;

beforeEach(async () => {
  await cleanDatabase();
  data = await seedOldLayout();
  await runPromote({ apply: true }, localDeps());
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("GET /api/categories depois da migração", () => {
  it("devolve 6 categorias na ordem certa", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body.map((c: { slug: string }) => c.slug)).toEqual(["pedras-brutas", "pedras-polidas", "big", "formas", "homedecor", "acessorios"]);
    expect(res.body.map((c: { position: number }) => c.position)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("Formas é categoria de nível 1 sem subcategorias; BIG tem 3 (Ametistas, Calcitas, Citrinos)", async () => {
    const res = await request(app).get("/api/categories");
    const formas = res.body.find((c: { slug: string }) => c.slug === "formas");
    const big = res.body.find((c: { slug: string }) => c.slug === "big");

    expect(formas).toMatchObject({ name: "Formas", subcategories: [] });
    expect(big.subcategories.map((s: { name: string }) => s.name)).toEqual(["Ametistas", "Calcitas", "Citrinos"]);
    // nenhuma subcategoria "formas" em lugar nenhum
    const allSubs = res.body.flatMap((c: { subcategories: { slug: string }[] }) => c.subcategories.map((s) => s.slug));
    expect(allSubs).not.toContain("formas");
    expect(allSubs).toHaveLength(9);
  });
});

describe("GET /api/products depois da migração", () => {
  it("filtrar pelo categoryId da Formas devolve exatamente os produtos movidos (ativos e inativos)", async () => {
    const formas = (await prisma.category.findUnique({ where: { slug: "formas" } }))!;

    const res = await request(app).get(`/api/products?categoryId=${formas.id}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items.map((p: { slug: string }) => p.slug).sort()).toEqual(["esfera-de-quartzo", "ovo-de-agata", "piramide-de-selenita"]);
    for (const item of res.body.items) expect(item).toMatchObject({ categoryId: formas.id, subcategoryId: null, category: { slug: "formas" } });
  });

  it("no catálogo público (active=true) só aparecem os ativos da Formas", async () => {
    const formas = (await prisma.category.findUnique({ where: { slug: "formas" } }))!;
    const res = await request(app).get(`/api/products?categoryId=${formas.id}&active=true`);
    expect(res.body.items.map((p: { slug: string }) => p.slug).sort()).toEqual(["esfera-de-quartzo", "piramide-de-selenita"]);
  });

  it("filtrar por BIG não traz mais os produtos movidos, e mantém os das outras subcategorias", async () => {
    const res = await request(app).get(`/api/products?categoryId=${data.big.id}`);
    expect(res.body.items.map((p: { slug: string }) => p.slug).sort()).toEqual(["ametista-gigante", "citrino-grande"]);
  });
});

describe("produtos na categoria Formas (sem subcategoria) são válidos", () => {
  const payload = (formasId: string) => ({
    name: "Cubo de Fluorita",
    slug: "cubo-de-fluorita",
    categoryId: formasId,
    price: 30,
    weightGrams: 120,
    sizeCm: 4,
  });

  it("cria um produto na Formas sem subcategoryId", async () => {
    const formas = (await prisma.category.findUnique({ where: { slug: "formas" } }))!;

    const res = await request(app).post("/api/products").set("Authorization", `Bearer ${token}`).send(payload(formas.id));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ categoryId: formas.id, subcategoryId: null });
  });

  it("ignora um subcategoryId qualquer: categoria sem subcategorias grava null", async () => {
    const formas = (await prisma.category.findUnique({ where: { slug: "formas" } }))!;
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...payload(formas.id), subcategoryId: data.formasSub.id });
    expect(res.status).toBe(201);
    expect(res.body.subcategoryId).toBeNull();
  });

  it("edita um produto da Formas (preço) sem informar subcategoria", async () => {
    const formas = (await prisma.category.findUnique({ where: { slug: "formas" } }))!;
    const existing = (await prisma.product.findFirst({ where: { categoryId: formas.id } }))!;

    const res = await request(app).patch(`/api/products/${existing.id}`).set("Authorization", `Bearer ${token}`).send({ price: 99 });

    expect(res.status).toBe(200);
    expect(Number(res.body.price)).toBe(99);
    expect(res.body).toMatchObject({ categoryId: formas.id, subcategoryId: null });
  });

  it("move um produto de BIG (com subcategoria) para a Formas pela edição: subcategoria vira null", async () => {
    const formas = (await prisma.category.findUnique({ where: { slug: "formas" } }))!;
    const bigProduct = data.others.find((p) => p.slug === "ametista-gigante")!;

    const res = await request(app).patch(`/api/products/${bigProduct.id}`).set("Authorization", `Bearer ${token}`).send({ categoryId: formas.id });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ categoryId: formas.id, subcategoryId: null });
  });

  it("BIG continua exigindo subcategoria (a regra para categorias com subcategorias não mudou)", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...payload(data.big.id), slug: "sem-sub" });
    expect(res.status).toBe(400);
  });
});
