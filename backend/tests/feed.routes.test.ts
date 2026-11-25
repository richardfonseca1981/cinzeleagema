import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase } from "./helpers";
import { buildPublicSlug } from "../src/lib/publicSlug";

const app = createApp();

let categoryId: string;

beforeEach(async () => {
  await cleanDatabase();
  const category = await prisma.category.create({ data: { name: "Pedras Brutas", slug: "pedras-brutas" } });
  categoryId = category.id;
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

async function createProductWithImage(data: Parameters<typeof prisma.product.create>[0]["data"]) {
  const product = await prisma.product.create({ data });
  await prisma.productImage.create({
    data: { productId: product.id, url: `https://pub-r2.example.com/${product.id}.webp`, key: `${product.id}.webp`, position: 0 },
  });
  return product;
}

describe("GET /api/feeds/google.xml", () => {
  it("responde XML sem auth, com Content-Type e Cache-Control corretos", async () => {
    const res = await request(app).get("/api/feeds/google.xml");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(res.headers["cache-control"]).toContain("s-maxage=300");
    expect(res.text).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
  });

  it("inclui peça elegível (ativa, com nome, preço e foto) com link canônico sem UTM", async () => {
    const product = await createProductWithImage({
      name: "Ametista Bruta",
      slug: "ametista-bruta",
      price: 1500,
      categoryId,
    });

    const res = await request(app).get("/api/feeds/google.xml");
    const slug = buildPublicSlug(product.name, product.id);

    expect(res.text).toContain(`<g:id>${product.id}</g:id>`);
    expect(res.text).toContain(`<link>https://www.cinzeleagema.com.br/catalogo/${slug}</link>`);
    expect(res.text).not.toContain("utm_");
  });

  it("exclui peça inativa (vendida, pela proxy atual) — some do feed", async () => {
    const sold = await createProductWithImage({
      name: "Peça Vendida",
      slug: "peca-vendida",
      price: 1500,
      categoryId,
      active: false,
    });

    const res = await request(app).get("/api/feeds/google.xml");
    expect(res.text).not.toContain(sold.id);
  });

  it("exclui peça com estoque controlado zerado — mesma proxy de 'vendida'", async () => {
    const soldByStock = await createProductWithImage({
      name: "Peça Estoque Zero",
      slug: "peca-estoque-zero",
      price: 1500,
      categoryId,
      trackStock: true,
      stockQty: 0,
    });

    const res = await request(app).get("/api/feeds/google.xml");
    expect(res.text).not.toContain(soldByStock.id);
  });

  it("exclui peça sem preço ('Consulte o valor')", async () => {
    const noPrice = await createProductWithImage({
      name: "Peça Sem Preço",
      slug: "peca-sem-preco",
      categoryId,
    });

    const res = await request(app).get("/api/feeds/google.xml");
    expect(res.text).not.toContain(noPrice.id);
  });

  it("exclui peça sem foto", async () => {
    const noPhoto = await prisma.product.create({
      data: { name: "Peça Sem Foto", slug: "peca-sem-foto", price: 1500, categoryId },
    });

    const res = await request(app).get("/api/feeds/google.xml");
    expect(res.text).not.toContain(noPhoto.id);
  });

  it("exclui peça sem nome (decisão: nunca entra no feed)", async () => {
    const unnamed = await createProductWithImage({
      slug: "peca-sem-nome",
      price: 1500,
      categoryId,
    });

    const res = await request(app).get("/api/feeds/google.xml");
    expect(res.text).not.toContain(unnamed.id);
  });

  it("peça desativada depois de já ter entrado some do feed na próxima chamada (cache não impede isso na própria API)", async () => {
    const product = await createProductWithImage({
      name: "Ametista Rolada",
      slug: "ametista-rolada",
      price: 1500,
      categoryId,
    });

    const before = await request(app).get("/api/feeds/google.xml");
    expect(before.text).toContain(product.id);

    await prisma.product.update({ where: { id: product.id }, data: { active: false } });

    const after = await request(app).get("/api/feeds/google.xml");
    expect(after.text).not.toContain(product.id);
  });
});
