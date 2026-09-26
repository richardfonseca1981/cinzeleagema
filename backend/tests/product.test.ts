import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";

const app = createApp();
const token = generateTestToken();

let categoryWithSubId: string;
let subcategoryId: string;
let otherSubcategoryId: string;
let categoryWithoutSubId: string;

beforeEach(async () => {
  await cleanDatabase();

  const categoryWithSub = await prisma.category.create({ data: { name: "Pedras Brutas", slug: "pedras-brutas" } });
  categoryWithSubId = categoryWithSub.id;
  const subcategory = await prisma.subcategory.create({
    data: { name: "Pedras Brutas Peça", slug: "pedras-brutas-peca", categoryId: categoryWithSubId },
  });
  subcategoryId = subcategory.id;
  const otherCategory = await prisma.category.create({ data: { name: "Pedras Polidas", slug: "pedras-polidas" } });
  const otherSubcategory = await prisma.subcategory.create({
    data: { name: "Pedras Roladas", slug: "pedras-roladas", categoryId: otherCategory.id },
  });
  otherSubcategoryId = otherSubcategory.id;

  const categoryWithoutSub = await prisma.category.create({ data: { name: "Homedecor", slug: "homedecor" } });
  categoryWithoutSubId = categoryWithoutSub.id;
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
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Esmeralda Colombiana 2.3ct",
        slug: "esmeralda-colombiana-2-3ct",
        price: 8500,
        trackStock: false,
        weightGrams: 0.46,
        sizeCm: 0.9,
        categoryId: categoryWithSubId,
        subcategoryId,
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Esmeralda Colombiana 2.3ct");
    expect(res.body.stockQty).toBeNull();
    expect(res.body.categoryId).toBe(categoryWithSubId);
    expect(res.body.subcategoryId).toBe(subcategoryId);
  });

  it("creates a product in a category without subcategories, without requiring subcategoryId", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Vaso Decorativo",
        slug: "vaso-decorativo",
        price: 150,
        trackStock: false,
        weightGrams: 500,
        sizeCm: 20,
        categoryId: categoryWithoutSubId,
      });

    expect(res.status).toBe(201);
    expect(res.body.categoryId).toBe(categoryWithoutSubId);
    expect(res.body.subcategoryId).toBeNull();
  });

  it("rejects creating a product without categoryId", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Peça sem categoria",
        slug: "peca-sem-categoria",
        price: 100,
        trackStock: false,
        weightGrams: 2,
        sizeCm: 1.5,
      });

    expect(res.status).toBe(400);
  });

  it("rejects a category that has subcategories when subcategoryId is missing", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Peça sem subcategoria",
        slug: "peca-sem-subcategoria",
        price: 100,
        trackStock: false,
        weightGrams: 2,
        sizeCm: 1.5,
        categoryId: categoryWithSubId,
      });

    expect(res.status).toBe(400);
  });

  it("rejects a subcategoryId that doesn't belong to the selected category", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Peça com subcategoria inválida",
        slug: "peca-subcategoria-invalida",
        price: 100,
        trackStock: false,
        weightGrams: 2,
        sizeCm: 1.5,
        categoryId: categoryWithSubId,
        subcategoryId: otherSubcategoryId,
      });

    expect(res.status).toBe(400);
  });

  it("clears stockQty when trackStock is false", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Peça sem controle de estoque",
        slug: "peca-sem-estoque",
        price: 100,
        trackStock: false,
        stockQty: 999,
        weightGrams: 2,
        sizeCm: 1.5,
        categoryId: categoryWithoutSubId,
      });

    expect(res.status).toBe(201);
    expect(res.body.stockQty).toBeNull();
  });

  it("supports a unique piece with trackStock=true and stockQty=1", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Peça única com estoque controlado",
        slug: "peca-unica-com-estoque",
        price: 100,
        trackStock: true,
        stockQty: 1,
        weightGrams: 2,
        sizeCm: 1.5,
        categoryId: categoryWithoutSubId,
      });

    expect(res.status).toBe(201);
    expect(res.body.stockQty).toBe(1);
  });

  it("edits a product's price", async () => {
    const product = await prisma.product.create({
      data: { name: "Produto Editável", slug: "produto-editavel", price: 10, categoryId: categoryWithoutSubId },
    });

    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ price: 25.5 });

    expect(res.status).toBe(200);
    expect(Number(res.body.price)).toBe(25.5);
  });

  it("rejects changing to a category with subcategories without providing subcategoryId", async () => {
    const product = await prisma.product.create({
      data: { name: "Produto a Editar", slug: "produto-a-editar", price: 10, categoryId: categoryWithoutSubId },
    });

    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ categoryId: categoryWithSubId });

    expect(res.status).toBe(400);
  });

  it("deactivates a product and excludes it from the active listing", async () => {
    const product = await prisma.product.create({
      data: { name: "Produto a Desativar", slug: "produto-a-desativar", price: 10, categoryId: categoryWithoutSubId },
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
    const product = await prisma.product.create({
      data: {
        name: "Produto Inativo",
        slug: "produto-inativo",
        price: 10,
        active: false,
        categoryId: categoryWithoutSubId,
      },
    });

    const res = await request(app)
      .patch(`/api/products/${product.id}/activate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);
  });

  it("filters products by categoryId", async () => {
    await prisma.product.create({
      data: {
        name: "Peça Bruta",
        slug: "peca-bruta",
        price: 10,
        categoryId: categoryWithSubId,
        subcategoryId,
      },
    });
    await prisma.product.create({
      data: { name: "Peça Homedecor", slug: "peca-homedecor", price: 10, categoryId: categoryWithoutSubId },
    });

    const res = await request(app)
      .get(`/api/products?categoryId=${categoryWithSubId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].slug).toBe("peca-bruta");
  });

  it("filters products by subcategoryId", async () => {
    await prisma.product.create({
      data: {
        name: "Peça Bruta",
        slug: "peca-bruta",
        price: 10,
        categoryId: categoryWithSubId,
        subcategoryId,
      },
    });
    await prisma.product.create({
      data: {
        name: "Peça Polida",
        slug: "peca-polida",
        price: 10,
        categoryId: categoryWithSubId,
        subcategoryId: null,
      },
    });

    const res = await request(app)
      .get(`/api/products?subcategoryId=${subcategoryId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].slug).toBe("peca-bruta");
  });
});
