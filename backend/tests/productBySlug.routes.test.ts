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

describe("GET /api/products/by-slug/:slugComId", () => {
  it("encontra a peça pelo slug atual (nome + sufixo do id) sem precisar de auth", async () => {
    const product = await prisma.product.create({
      data: { name: "Ametista Bruta", slug: "ametista-bruta", price: 1500, categoryId },
    });
    const slug = buildPublicSlug(product.name, product.id);

    const res = await request(app).get(`/api/products/by-slug/${slug}`);

    expect(res.status).toBe(200);
    expect(res.body.product.id).toBe(product.id);
    expect(res.body.canonicalSlug).toBe(slug);
  });

  it("encontra a mesma peça pela URL antiga (cuid puro) — compatibilidade com links já publicados", async () => {
    const product = await prisma.product.create({
      data: { name: "Ametista Bruta", slug: "ametista-bruta", price: 1500, categoryId },
    });

    const res = await request(app).get(`/api/products/by-slug/${product.id}`);

    expect(res.status).toBe(200);
    expect(res.body.product.id).toBe(product.id);
    expect(res.body.canonicalSlug).toBe(buildPublicSlug(product.name, product.id));
  });

  it("renomear a peça não quebra o link antigo: o sufixo continua achando a peça, e canonicalSlug aponta para o slug novo", async () => {
    const product = await prisma.product.create({
      data: { name: "Ametista Bruta", slug: "ametista-bruta", price: 1500, categoryId },
    });
    const oldSlug = buildPublicSlug(product.name, product.id);

    const renamed = await prisma.product.update({ where: { id: product.id }, data: { name: "Ametista Importada" } });
    const newSlug = buildPublicSlug(renamed.name, renamed.id);
    expect(newSlug).not.toBe(oldSlug);

    // Acessar pelo slug ANTIGO (link já publicado antes do rename) ainda acha a peça...
    const res = await request(app).get(`/api/products/by-slug/${oldSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.product.id).toBe(product.id);
    // ...e devolve o slug ATUAL para o frontend redirecionar.
    expect(res.body.canonicalSlug).toBe(newSlug);
  });

  it("sufixo sem nenhuma peça correspondente devolve 404", async () => {
    const res = await request(app).get("/api/products/by-slug/peca-inexistente-ffffff");
    expect(res.status).toBe(404);
  });

  it("devolve a peça mesmo inativa (mesmo comportamento público de GET /api/products/:id)", async () => {
    const product = await prisma.product.create({
      data: { name: "Peça Inativa", slug: "peca-inativa", price: 1500, categoryId, active: false },
    });
    const slug = buildPublicSlug(product.name, product.id);

    const res = await request(app).get(`/api/products/by-slug/${slug}`);
    expect(res.status).toBe(200);
    expect(res.body.product.active).toBe(false);
  });
});
