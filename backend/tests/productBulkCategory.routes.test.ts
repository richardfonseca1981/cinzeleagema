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
  it("bulk-category e undo exigem token", async () => {
    await request(app).patch("/api/admin/products/bulk-category").send({ items: [] }).expect(401);
    await request(app).post("/api/admin/products/bulk-category/undo").expect(401);
  });
});

describe("PATCH /api/admin/products/bulk-category", () => {
  it("move várias peças para a mesma categoria, numa chamada só, e grava o log", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } });
    const p2 = await prisma.product.create({ data: { name: "P2", slug: "p2" } });

    const res = await request(app)
      .patch("/api/admin/products/bulk-category")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { id: p1.id, categoryId: category.id, subcategoryId: null },
          { id: p2.id, categoryId: category.id, subcategoryId: null },
        ],
      })
      .expect(200);

    expect(res.body.updated).toBe(2);
    expect(res.body.skipped).toBe(0);

    const reloaded1 = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
    expect(reloaded1.categoryId).toBe(category.id);

    const log = await prisma.adminActionLog.findFirst({ where: { action: "bulk_category_move" } });
    expect(log).toMatchObject({ adminId: "admin-1", adminUsername: "felipe" });
  });

  it("destinos heterogêneos (cada peça pode ir pra um lugar diferente) numa chamada só", async () => {
    const catA = await prisma.category.create({ data: { name: "A", slug: "a", position: 0 } });
    const catB = await prisma.category.create({ data: { name: "B", slug: "b", position: 1 } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } });
    const p2 = await prisma.product.create({ data: { name: "P2", slug: "p2" } });

    await request(app)
      .patch("/api/admin/products/bulk-category")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { id: p1.id, categoryId: catA.id, subcategoryId: null },
          { id: p2.id, categoryId: catB.id, subcategoryId: null },
        ],
      })
      .expect(200);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: p1.id } })).categoryId).toBe(catA.id);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p2.id } })).categoryId).toBe(catB.id);
  });

  it("subcategoryId que não pertence à categoria informada é rejeitado (400), nada é alterado", async () => {
    const catA = await prisma.category.create({ data: { name: "A", slug: "a", position: 0 } });
    const catB = await prisma.category.create({ data: { name: "B", slug: "b", position: 1 } });
    const subOfB = await prisma.subcategory.create({ data: { name: "SubB", slug: "sub-b", position: 0, categoryId: catB.id } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } });

    const res = await request(app)
      .patch("/api/admin/products/bulk-category")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ id: p1.id, categoryId: catA.id, subcategoryId: subOfB.id }] })
      .expect(400);

    expect(res.body.details[0]).toMatchObject({ id: p1.id, reason: "subcategoria não pertence à categoria informada" });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p1.id } })).categoryId).toBeNull();
  });

  it("categoria inexistente é rejeitada (400)", async () => {
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } });

    await request(app)
      .patch("/api/admin/products/bulk-category")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ id: p1.id, categoryId: "categoria-inexistente", subcategoryId: null }] })
      .expect(400);
  });

  it("id de peça desconhecido é ignorado (skipped), resto é aplicado normalmente", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } });

    const res = await request(app)
      .patch("/api/admin/products/bulk-category")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { id: p1.id, categoryId: category.id, subcategoryId: null },
          { id: "id-que-nao-existe", categoryId: category.id, subcategoryId: null },
        ],
      })
      .expect(200);

    expect(res.body.updated).toBe(1);
    expect(res.body.skipped).toBe(1);
    expect(res.body.skippedIds).toEqual(["id-que-nao-existe"]);
  });

  it("mais de 500 itens é rejeitado (400) pela validação do Zod", async () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ id: `id-${i}`, categoryId: null, subcategoryId: null }));
    await request(app).patch("/api/admin/products/bulk-category").set("Authorization", `Bearer ${token}`).send({ items }).expect(400);
  });

  it("zerar tudo (categoryId null + subcategoryId null) é só mais um destino — não é um endpoint especial", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const sub = await prisma.subcategory.create({ data: { name: "Sub", slug: "sub", position: 0, categoryId: category.id } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1", categoryId: category.id, subcategoryId: sub.id } });

    await request(app)
      .patch("/api/admin/products/bulk-category")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ id: p1.id, categoryId: null, subcategoryId: null }] })
      .expect(200);

    const reloaded = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
    expect(reloaded.categoryId).toBeNull();
    expect(reloaded.subcategoryId).toBeNull();
  });
});

describe("POST /api/admin/products/bulk-category/undo", () => {
  it("sem nenhuma ação em lote ainda, devolve 404", async () => {
    await request(app).post("/api/admin/products/bulk-category/undo").set("Authorization", `Bearer ${token}`).expect(404);
  });

  it("restaura exatamente o estado anterior à ÚLTIMA ação em lote", async () => {
    const catA = await prisma.category.create({ data: { name: "A", slug: "a", position: 0 } });
    const catB = await prisma.category.create({ data: { name: "B", slug: "b", position: 1 } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1", categoryId: catA.id } });
    const p2 = await prisma.product.create({ data: { name: "P2", slug: "p2" } }); // sem categoria

    await request(app)
      .patch("/api/admin/products/bulk-category")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { id: p1.id, categoryId: catB.id, subcategoryId: null },
          { id: p2.id, categoryId: catB.id, subcategoryId: null },
        ],
      })
      .expect(200);

    const res = await request(app).post("/api/admin/products/bulk-category/undo").set("Authorization", `Bearer ${token}`).expect(200);

    expect(res.body.updated).toBe(2);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p1.id } })).categoryId).toBe(catA.id);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p2.id } })).categoryId).toBeNull();

    const undoLog = await prisma.adminActionLog.findFirst({ where: { action: "bulk_category_undo" } });
    expect(undoLog).not.toBeNull();
  });

  it("duas ações em lote seguidas: undo desfaz só a MAIS RECENTE", async () => {
    const catA = await prisma.category.create({ data: { name: "A", slug: "a", position: 0 } });
    const catB = await prisma.category.create({ data: { name: "B", slug: "b", position: 1 } });
    const catC = await prisma.category.create({ data: { name: "C", slug: "c", position: 2 } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1", categoryId: catA.id } });

    await request(app)
      .patch("/api/admin/products/bulk-category")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ id: p1.id, categoryId: catB.id, subcategoryId: null }] })
      .expect(200);
    await request(app)
      .patch("/api/admin/products/bulk-category")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ id: p1.id, categoryId: catC.id, subcategoryId: null }] })
      .expect(200);

    await request(app).post("/api/admin/products/bulk-category/undo").set("Authorization", `Bearer ${token}`).expect(200);

    // Volta para B (estado antes da segunda chamada), não para A.
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p1.id } })).categoryId).toBe(catB.id);
  });
});

describe("GET /api/admin/products/bulk-category/undo-status", () => {
  it("exige token", async () => {
    await request(app).get("/api/admin/products/bulk-category/undo-status").expect(401);
  });

  it("sem nenhuma ação ainda, não há nada pra desfazer", async () => {
    const res = await request(app)
      .get("/api/admin/products/bulk-category/undo-status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({ available: false, count: 0 });
  });

  it("depois de mover em lote, fica disponível com a contagem de peças afetadas", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } });
    const p2 = await prisma.product.create({ data: { name: "P2", slug: "p2" } });

    await request(app)
      .patch("/api/admin/products/bulk-category")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { id: p1.id, categoryId: category.id, subcategoryId: null },
          { id: p2.id, categoryId: category.id, subcategoryId: null },
        ],
      })
      .expect(200);

    const res = await request(app)
      .get("/api/admin/products/bulk-category/undo-status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({ available: true, count: 2 });
  });

  it("depois de desfazer, some de novo", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } });

    await request(app)
      .patch("/api/admin/products/bulk-category")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ id: p1.id, categoryId: category.id, subcategoryId: null }] })
      .expect(200);
    await request(app).post("/api/admin/products/bulk-category/undo").set("Authorization", `Bearer ${token}`).expect(200);

    const res = await request(app)
      .get("/api/admin/products/bulk-category/undo-status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({ available: false, count: 0 });
  });

  it("se outra ação administrativa aconteceu depois do mover em lote, não fica mais disponível", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } });

    await request(app)
      .patch("/api/admin/products/bulk-category")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ id: p1.id, categoryId: category.id, subcategoryId: null }] })
      .expect(200);

    // Simula outra ação da tela acontecendo depois (ex.: criar categoria) —
    // a última entrada do log deixa de ser o mover em lote.
    await prisma.adminActionLog.create({
      data: { adminId: "admin-1", adminUsername: "felipe", action: "category_create", payload: {} },
    });

    const res = await request(app)
      .get("/api/admin/products/bulk-category/undo-status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({ available: false, count: 0 });
  });
});
