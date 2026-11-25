import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";

const app = createApp();
const token = generateTestToken({ sub: "admin-1", username: "felipe" });

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("Autorização", () => {
  it("todas as rotas /api/admin/categories exigem token", async () => {
    await request(app).get("/api/admin/categories/tree").expect(401);
    await request(app).post("/api/admin/categories").send({ name: "X" }).expect(401);
  });
});

describe("POST /api/admin/categories", () => {
  it("cria categoria com slug gerado e posição no fim", async () => {
    await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });

    const res = await request(app)
      .post("/api/admin/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pedras Brutas" })
      .expect(201);

    expect(res.body.slug).toBe("pedras-brutas");
    expect(res.body.position).toBe(1);
    expect(res.body.productCount).toBe(0);

    const log = await prisma.adminActionLog.findFirst({ where: { action: "category_create" } });
    expect(log).toMatchObject({ adminId: "admin-1", adminUsername: "felipe" });
  });
});

describe("PATCH /api/admin/categories/:id — renomear nunca recalcula o slug", () => {
  it("troca o nome, slug permanece o mesmo", async () => {
    const category = await prisma.category.create({ data: { name: "Pedras Brutas", slug: "pedras-brutas", position: 0 } });

    const res = await request(app)
      .patch(`/api/admin/categories/${category.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Pedras Brutas Selecionadas" })
      .expect(200);

    expect(res.body.name).toBe("Pedras Brutas Selecionadas");
    expect(res.body.slug).toBe("pedras-brutas");

    const log = await prisma.adminActionLog.findFirst({ where: { action: "category_rename" } });
    expect(log?.payload).toMatchObject({ previousName: "Pedras Brutas", name: "Pedras Brutas Selecionadas" });
  });
});

describe("DELETE /api/admin/categories/:id", () => {
  it("categoria sem peça é apagada direto", async () => {
    const category = await prisma.category.create({ data: { name: "Vazia", slug: "vazia", position: 0 } });

    await request(app).delete(`/api/admin/categories/${category.id}`).set("Authorization", `Bearer ${token}`).expect(200);

    expect(await prisma.category.findUnique({ where: { id: category.id } })).toBeNull();
  });

  it("categoria com peça é BLOQUEADA (409) com a contagem exata, sem confirmação", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    await prisma.product.create({ data: { name: "Ametista", slug: "ametista", categoryId: category.id } });
    await prisma.product.create({ data: { name: "Citrino", slug: "citrino", categoryId: category.id } });

    const res = await request(app)
      .delete(`/api/admin/categories/${category.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    expect(res.body.productCount).toBe(2);
    expect(await prisma.category.findUnique({ where: { id: category.id } })).not.toBeNull();
  });

  it("categoria com peça e subcategoria: contagem inclui peças da subcategoria (mesmo categoryId)", async () => {
    const category = await prisma.category.create({ data: { name: "Pedras Brutas", slug: "pedras-brutas", position: 0 } });
    const sub = await prisma.subcategory.create({ data: { name: "Capelas", slug: "capelas", position: 0, categoryId: category.id } });
    await prisma.product.create({ data: { name: "Capela 1", slug: "capela-1", categoryId: category.id, subcategoryId: sub.id } });

    const res = await request(app)
      .delete(`/api/admin/categories/${category.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    expect(res.body.productCount).toBe(1);
  });

  it("moveAffectedToUncategorized=true move as peças para Sem categoria E apaga, numa transação só", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const sub = await prisma.subcategory.create({ data: { name: "Ametistas", slug: "ametistas", position: 0, categoryId: category.id } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1", categoryId: category.id } });
    const p2 = await prisma.product.create({ data: { name: "P2", slug: "p2", categoryId: category.id, subcategoryId: sub.id } });

    const res = await request(app)
      .delete(`/api/admin/categories/${category.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ moveAffectedToUncategorized: true })
      .expect(200);

    expect(res.body.productsMoved).toBe(2);
    expect(await prisma.category.findUnique({ where: { id: category.id } })).toBeNull();
    // Subcategoria apagada em cascata pelo banco.
    expect(await prisma.subcategory.findUnique({ where: { id: sub.id } })).toBeNull();

    const reloaded1 = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
    const reloaded2 = await prisma.product.findUniqueOrThrow({ where: { id: p2.id } });
    expect(reloaded1.categoryId).toBeNull();
    expect(reloaded2.categoryId).toBeNull();
    expect(reloaded2.subcategoryId).toBeNull();

    const log = await prisma.adminActionLog.findFirst({ where: { action: "category_delete" } });
    expect(log?.payload).toMatchObject({ name: "Big" });
    const movedProducts = (log?.payload as { movedProducts: Array<{ id: string; categoryId: string | null; subcategoryId: string | null }> })
      .movedProducts;
    expect(movedProducts.map((p) => p.id).sort()).toEqual([p1.id, p2.id].sort());
    // Estado ANTERIOR gravado no log (antes de virar null).
    expect(movedProducts.find((p) => p.id === p2.id)).toMatchObject({ categoryId: category.id, subcategoryId: sub.id });
  });
});

describe("Subcategorias", () => {
  it("cria subcategoria sob a categoria, slug próprio", async () => {
    const category = await prisma.category.create({ data: { name: "Pedras Brutas", slug: "pedras-brutas", position: 0 } });

    const res = await request(app)
      .post(`/api/admin/categories/${category.id}/subcategories`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Capelas de Ametista" })
      .expect(201);

    expect(res.body.slug).toBe("capelas-de-ametista");
    expect(res.body.categoryId).toBe(category.id);
  });

  it("renomear subcategoria não muda o slug", async () => {
    const category = await prisma.category.create({ data: { name: "Pedras Brutas", slug: "pedras-brutas", position: 0 } });
    const sub = await prisma.subcategory.create({ data: { name: "Capelas", slug: "capelas", position: 0, categoryId: category.id } });

    const res = await request(app)
      .patch(`/api/admin/categories/subcategories/${sub.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Capelas Grandes" })
      .expect(200);

    expect(res.body.name).toBe("Capelas Grandes");
    expect(res.body.slug).toBe("capelas");
  });

  it("apagar subcategoria com peça é bloqueado (409); confirmando, só limpa a SUBcategoria — categoryId permanece", async () => {
    const category = await prisma.category.create({ data: { name: "Pedras Brutas", slug: "pedras-brutas", position: 0 } });
    const sub = await prisma.subcategory.create({ data: { name: "Capelas", slug: "capelas", position: 0, categoryId: category.id } });
    const product = await prisma.product.create({ data: { name: "P1", slug: "p1", categoryId: category.id, subcategoryId: sub.id } });

    await request(app).delete(`/api/admin/categories/subcategories/${sub.id}`).set("Authorization", `Bearer ${token}`).expect(409);

    await request(app)
      .delete(`/api/admin/categories/subcategories/${sub.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ moveAffectedToUncategorized: true })
      .expect(200);

    const reloaded = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(reloaded.categoryId).toBe(category.id);
    expect(reloaded.subcategoryId).toBeNull();
  });
});

describe("GET /api/admin/categories/tree", () => {
  it("devolve categorias com contagem e o nó sintético 'Sem categoria'", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const sub = await prisma.subcategory.create({ data: { name: "Ametistas", slug: "ametistas", position: 0, categoryId: category.id } });
    await prisma.product.create({ data: { name: "P1", slug: "p1", categoryId: category.id, subcategoryId: sub.id } });
    await prisma.product.create({ data: { name: "P2", slug: "p2", categoryId: category.id } });
    await prisma.product.create({ data: { name: "P3 sem categoria", slug: "p3" } });

    const res = await request(app).get("/api/admin/categories/tree").set("Authorization", `Bearer ${token}`).expect(200);

    expect(res.body.categories).toHaveLength(1);
    expect(res.body.categories[0].productCount).toBe(2);
    expect(res.body.categories[0].subcategories[0].productCount).toBe(1);
    expect(res.body.uncategorized.productCount).toBe(1);
  });
});
