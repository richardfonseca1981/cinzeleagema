import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";

const app = createApp();
const token = generateTestToken();

async function createCategoryFixture() {
  return prisma.category.create({
    data: {
      name: "Esmeralda",
      slug: "esmeralda",
      attributeSchema: [
        { key: "carat", label: "Quilate", type: "number" },
        { key: "cut", label: "Corte", type: "text" },
      ],
    },
  });
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("Product routes", () => {
  it("rejects requests without an auth token", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(401);
  });

  it("creates a product", async () => {
    const category = await createCategoryFixture();

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Esmeralda Colombiana 2.3ct",
        slug: "esmeralda-colombiana-2-3ct",
        categoryId: category.id,
        price: 8500,
        trackStock: false,
        attributes: { carat: 2.3, cut: "Esmeralda" },
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Esmeralda Colombiana 2.3ct");
    expect(res.body.stockQty).toBeNull();
    expect(res.body.attributes).toEqual({ carat: 2.3, cut: "Esmeralda" });
  });

  it("rejects product creation with an invalid category", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Produto sem categoria válida",
        slug: "produto-invalido",
        categoryId: "categoria-inexistente",
        price: 10,
      });

    expect(res.status).toBe(400);
  });

  it("clears stockQty when trackStock is false", async () => {
    const category = await createCategoryFixture();

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Peça sem controle de estoque",
        slug: "peca-sem-estoque",
        categoryId: category.id,
        price: 100,
        trackStock: false,
        stockQty: 999,
      });

    expect(res.status).toBe(201);
    expect(res.body.stockQty).toBeNull();
  });

  it("supports a unique piece with trackStock=true and stockQty=1", async () => {
    const category = await createCategoryFixture();

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Peça única com estoque controlado",
        slug: "peca-unica-com-estoque",
        categoryId: category.id,
        price: 100,
        trackStock: true,
        stockQty: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.stockQty).toBe(1);
  });

  it("lists products filtered by category", async () => {
    const categoryA = await createCategoryFixture();
    const categoryB = await prisma.category.create({
      data: { name: "Ametista", slug: "ametista", attributeSchema: [] },
    });

    await prisma.product.create({
      data: { name: "Produto A", slug: "produto-a", categoryId: categoryA.id, price: 10 },
    });
    await prisma.product.create({
      data: { name: "Produto B", slug: "produto-b", categoryId: categoryB.id, price: 20 },
    });

    const res = await request(app)
      .get(`/api/products?categoryId=${categoryA.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe("Produto A");
  });

  it("edits a product's price", async () => {
    const category = await createCategoryFixture();
    const product = await prisma.product.create({
      data: { name: "Produto Editável", slug: "produto-editavel", categoryId: category.id, price: 10 },
    });

    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ price: 25.5 });

    expect(res.status).toBe(200);
    expect(Number(res.body.price)).toBe(25.5);
  });

  it("deactivates a product and excludes it from the active listing", async () => {
    const category = await createCategoryFixture();
    const product = await prisma.product.create({
      data: { name: "Produto a Desativar", slug: "produto-a-desativar", categoryId: category.id, price: 10 },
    });

    const deactivateRes = await request(app)
      .patch(`/api/products/${product.id}/deactivate`)
      .set("Authorization", `Bearer ${token}`);
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.active).toBe(false);

    const listRes = await request(app)
      .get("/api/products?active=true")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.body.items.find((p: { id: string }) => p.id === product.id)).toBeUndefined();
  });

  it("reactivates a previously deactivated product", async () => {
    const category = await createCategoryFixture();
    const product = await prisma.product.create({
      data: { name: "Produto Inativo", slug: "produto-inativo", categoryId: category.id, price: 10, active: false },
    });

    const res = await request(app)
      .patch(`/api/products/${product.id}/activate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);
  });
});
