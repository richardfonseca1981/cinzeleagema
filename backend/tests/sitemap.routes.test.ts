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
  const category = await prisma.category.create({ data: { name: "Homedecor", slug: "homedecor" } });
  categoryId = category.id;
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("GET /api/sitemap.xml", () => {
  it("responde XML sem auth, com Content-Type correto e as páginas estáticas", async () => {
    const res = await request(app).get("/api/sitemap.xml");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(res.headers["cache-control"]).toContain("s-maxage");
    expect(res.text).toContain("<urlset");
    expect(res.text).toContain("<loc>https://www.cinzeleagema.com.br/</loc>");
    expect(res.text).toContain("<loc>https://www.cinzeleagema.com.br/catalogo</loc>");
  });

  it("inclui só peças elegíveis — exclui inativa, nome provisório e preço provisório", async () => {
    const eligible = await prisma.product.create({
      data: { name: "Ametista Bruta", slug: "ametista-bruta", price: 1500, categoryId },
    });
    await prisma.product.create({
      data: { name: "Peça Inativa", slug: "peca-inativa", price: 1500, categoryId, active: false },
    });
    await prisma.product.create({
      data: { name: "Pedra 1234 - Peso", slug: "pedra-1234-peso", price: 1500, categoryId },
    });
    await prisma.product.create({
      data: { name: "Peça Preço Provisório", slug: "peca-preco-provisorio", price: 1, categoryId },
    });

    const res = await request(app).get("/api/sitemap.xml");
    const productLocCount = (res.text.match(/<loc>https:\/\/www\.cinzeleagema\.com\.br\/catalogo\/[^<]+<\/loc>/g) ?? [])
      .length;

    expect(productLocCount).toBe(1);
    expect(res.text).toContain(buildPublicSlug(eligible.name, eligible.id));
  });
});
