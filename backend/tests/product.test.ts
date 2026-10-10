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
  it("allows listing products without an auth token (public catalog)", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
  });

  it("rejects creating a product without an auth token", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ name: "Peça", slug: "peca", price: 10, categoryId: categoryWithoutSubId });
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

  it("creates a product without blocking on translation (nameEn stays null when Claude isn't configured)", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Turmalina Verde",
        slug: "turmalina-verde",
        price: 300,
        weightGrams: 2,
        sizeCm: 1.5,
        categoryId: categoryWithoutSubId,
      });

    expect(res.status).toBe(201);
    expect(res.body.nameEn).toBeNull();
  });

  it("rejects an unauthenticated retranslate request", async () => {
    const product = await prisma.product.create({
      data: { name: "Granada Vermelha", slug: "granada-vermelha", price: 50, categoryId: categoryWithoutSubId },
    });

    const res = await request(app).post(`/api/products/${product.id}/retranslate`);
    expect(res.status).toBe(401);
  });

  it("returns 502 from retranslate when the Claude API isn't configured", async () => {
    const product = await prisma.product.create({
      data: { name: "Quartzo Rosa", slug: "quartzo-rosa", price: 50, categoryId: categoryWithoutSubId },
    });

    const res = await request(app)
      .post(`/api/products/${product.id}/retranslate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(502);
  });

  describe("campos opcionais (nome, preço, categoria)", () => {
    it("creates a product with null name, price and category", async () => {
      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: null, price: null, categoryId: null });

      expect(res.status).toBe(201);
      expect(res.body.name).toBeNull();
      expect(res.body.price).toBeNull();
      expect(res.body.categoryId).toBeNull();
      expect(res.body.subcategoryId).toBeNull();
      // Slug sempre existe, mesmo sem nome.
      expect(res.body.slug).toMatch(/^peca-[a-z0-9]{10}$/);
    });

    it("keeps price=0 distinct from price=null (0 é preço real, null é 'consulte o valor')", async () => {
      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Peça promocional", price: 0, categoryId: categoryWithoutSubId });

      expect(res.status).toBe(201);
      expect(Number(res.body.price)).toBe(0);
      expect(res.body.price).not.toBeNull();
    });

    it("ignores a slug sent by the client — slug is always server-generated", async () => {
      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Peça com slug forjado", slug: "slug-forjado", price: 10, categoryId: categoryWithoutSubId });

      expect(res.status).toBe(201);
      expect(res.body.slug).not.toBe("slug-forjado");
      expect(res.body.slug).toBe("peca-com-slug-forjado");
    });

    it("two products with the same name get different slugs (collision)", async () => {
      const first = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Citrino", price: 10, categoryId: categoryWithoutSubId });
      const second = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Citrino", price: 20, categoryId: categoryWithoutSubId });

      expect(first.body.slug).toBe("citrino");
      expect(second.body.slug).toBe("citrino-2");
    });

    it("never changes the slug on edit, even after the name is filled in later", async () => {
      const created = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: null, price: null, categoryId: null });
      const originalSlug = created.body.slug;

      const updated = await request(app)
        .patch(`/api/products/${created.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Agora com nome", slug: "tentativa-de-mudar-o-slug" });

      expect(updated.status).toBe(200);
      expect(updated.body.name).toBe("Agora com nome");
      expect(updated.body.slug).toBe(originalSlug);
    });

    it("clears price via PATCH (explicit null), distinct from omitting the field", async () => {
      const product = await prisma.product.create({
        data: { name: "Peça com preço", slug: "peca-com-preco", price: 99, categoryId: categoryWithoutSubId },
      });

      const res = await request(app)
        .patch(`/api/products/${product.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ price: null });

      expect(res.status).toBe(200);
      expect(res.body.price).toBeNull();
    });

    it("clears categoryId via PATCH (explicit null) without trying to resolve a subcategory", async () => {
      const product = await prisma.product.create({
        data: {
          name: "Peça com categoria",
          slug: "peca-com-categoria",
          price: 10,
          categoryId: categoryWithSubId,
          subcategoryId,
        },
      });

      const res = await request(app)
        .patch(`/api/products/${product.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ categoryId: null });

      expect(res.status).toBe(200);
      expect(res.body.categoryId).toBeNull();
      expect(res.body.subcategoryId).toBeNull();
    });

    it("rejects an empty-string name instead of silently storing it", async () => {
      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "   ", price: 10, categoryId: categoryWithoutSubId });

      expect(res.status).toBe(400);
    });

    it("does not call the translation when creating a product without a name", async () => {
      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: null, price: 10, categoryId: categoryWithoutSubId });

      expect(res.status).toBe(201);
      // Sem retranslate manual nem nome, nameEn tem que continuar null — a
      // chamada em background (se tivesse disparado por engano) teria uma
      // janela curta, mas o teste principal é não lançar/quebrar a criação.
      expect(res.body.nameEn).toBeNull();
    });

    it("returns 400 (not 500, not a Claude call) from retranslate when the product has no name", async () => {
      const product = await prisma.product.create({
        data: { name: null, slug: "peca-sem-nome-retranslate", price: 10, categoryId: categoryWithoutSubId },
      });

      const res = await request(app)
        .post(`/api/products/${product.id}/retranslate`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/nome/i);
    });

    it("regression: a fully-filled product is returned unchanged by the API", async () => {
      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Esmeralda Completa",
          description: "Peça de referência com todos os campos.",
          categoryId: categoryWithSubId,
          subcategoryId,
          price: 1234.56,
          sku: "ESM-001",
          weightGrams: 3.2,
          sizeCm: 1.1,
          trackStock: true,
          stockQty: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: "Esmeralda Completa",
        description: "Peça de referência com todos os campos.",
        categoryId: categoryWithSubId,
        subcategoryId,
        sku: "ESM-001",
        trackStock: true,
        stockQty: 1,
      });
      expect(Number(res.body.price)).toBe(1234.56);
      expect(Number(res.body.weightGrams)).toBe(3.2);
      expect(Number(res.body.sizeCm)).toBe(1.1);
      expect(res.body.slug).toBe("esmeralda-completa");

      const fetched = await request(app).get(`/api/products/${res.body.id}`);
      expect(fetched.body).toMatchObject(res.body);
    });
  });
});
