import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";
import { buildListingDraft, getReadinessIssues, type ListingBuilderInput } from "../src/lib/mercadoLivre/listingBuilder";

// Etapa "título aprovado" — Product.mlTitle só conta pro anúncio com
// mlTitleApprovedAt preenchido (ver listingBuilder.ts resolveDraftTitle).
// Cobre: validação na escrita (zod), aprovar/editar/remover aprovação,
// sugestões com contexto do catálogo inteiro + colisão, e o efeito em
// getReadinessIssues (title_not_approved).
const app = createApp();
const auth = { Authorization: `Bearer ${generateTestToken({ sub: "admin-ml-title-test" })}` };

async function createProduct(overrides: Record<string, unknown> = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const product = await prisma.product.create({
    data: {
      name: "Ametista Lapidada",
      slug: `ametista-titulo-${suffix}`,
      sku: `AMT-${suffix}`,
      price: 900,
      active: true,
      trackStock: false,
      weightGrams: 400,
      sizeCm: 12,
      ...overrides,
    },
  });
  // Elegibilidade (validateListing) bloqueia peça sem foto ("no_photos") —
  // os testes de sugestão de título precisam de peças APTAS.
  await prisma.productImage.create({
    data: { productId: product.id, url: `https://cdn.test/${product.id}.jpg`, key: `products/${product.id}/1.jpg`, position: 0 },
  });
  return product;
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("mlTitle — validação na escrita (POST/PATCH /api/products)", () => {
  it("rejeita mlTitle maior que 60 caracteres", async () => {
    const longTitle = "Ametista Lapidada Extremamente Grande Com Nome Muito Longo Demais Para Caber";
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "Ametista", price: 500, categoryId: null, mlTitle: longTitle });
    expect(res.status).toBe(400);
  });

  it("rejeita mlTitle com termo promocional/de preço", async () => {
    const product = await createProduct();
    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .set(auth)
      .send({ mlTitle: "Ametista Lapidada Oferta Imperdível" });
    expect(res.status).toBe(400);
  });

  it("rejeita mlTitle com nome da loja", async () => {
    const product = await createProduct();
    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .set(auth)
      .send({ mlTitle: "Ametista Cinzel e a Gema" });
    expect(res.status).toBe(400);
  });

  it("rejeita mlTitle com URL/telefone", async () => {
    const product = await createProduct();
    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .set(auth)
      .send({ mlTitle: "Ametista (11) 98765-4321" });
    expect(res.status).toBe(400);
  });

  it("aceita um mlTitle válido e grava sem aprovação (mlTitleApprovedAt null)", async () => {
    const product = await createProduct();
    const res = await request(app).patch(`/api/products/${product.id}`).set(auth).send({ mlTitle: "Ametista Lapidada Natural" });
    expect(res.status).toBe(200);
    expect(res.body.mlTitle).toBe("Ametista Lapidada Natural");
    expect(res.body.mlTitleApprovedAt).toBeNull();
  });
});

describe("Aprovar/remover aprovação", () => {
  it("POST /:id/ml-title/approve sem mlTitle cadastrado: 400", async () => {
    const product = await createProduct();
    const res = await request(app).post(`/api/admin/products/${product.id}/ml-title/approve`).set(auth);
    expect(res.status).toBe(400);
  });

  it("aprova com mlTitle preenchido: grava mlTitleApprovedAt", async () => {
    const product = await createProduct({ mlTitle: "Ametista Lapidada Natural" });
    const res = await request(app).post(`/api/admin/products/${product.id}/ml-title/approve`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.mlTitleApprovedAt).toBeTruthy();
  });

  it("remove aprovação: mlTitleApprovedAt volta a null, mlTitle permanece", async () => {
    const product = await createProduct({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: new Date() });
    const res = await request(app).post(`/api/admin/products/${product.id}/ml-title/unapprove`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.mlTitleApprovedAt).toBeNull();
    expect(res.body.mlTitle).toBe("Ametista Lapidada Natural");
  });

  it("editar mlTitle depois de aprovado limpa a aprovação", async () => {
    const product = await createProduct({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: new Date() });
    const res = await request(app).patch(`/api/products/${product.id}`).set(auth).send({ mlTitle: "Ametista Lapidada Única" });
    expect(res.status).toBe(200);
    expect(res.body.mlTitle).toBe("Ametista Lapidada Única");
    expect(res.body.mlTitleApprovedAt).toBeNull();
  });

  it("reenviar o MESMO mlTitle não limpa a aprovação", async () => {
    const approvedAt = new Date();
    const product = await createProduct({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: approvedAt });
    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .set(auth)
      .send({ mlTitle: "Ametista Lapidada Natural", price: 950 });
    expect(res.status).toBe(200);
    expect(res.body.mlTitleApprovedAt).toBeTruthy();
  });

  it("editar outro campo (price) nunca limpa a aprovação", async () => {
    const product = await createProduct({ mlTitle: "Ametista Lapidada Natural", mlTitleApprovedAt: new Date() });
    const res = await request(app).patch(`/api/products/${product.id}`).set(auth).send({ price: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.mlTitleApprovedAt).toBeTruthy();
  });
});

describe("GET /api/admin/mercadolivre/title-suggestions/:productId", () => {
  it("devolve titleA/titleB gerados com o catálogo inteiro e detecta colisão com mlTitle aprovado de outra peça", async () => {
    // mlTitle fixado com o texto EXATO que o titleGenerator produziria pra
    // uma peça "Topázio Imperial" de 20cm (confirmado à parte) — isola a
    // colisão com o mlTitle JÁ APROVADO de outra peça da dedup interna do
    // titleGenerator entre sugestões do mesmo lote (ver
    // computeNeedsWeightDifferentiation), que é um mecanismo diferente.
    const colliding = await createProduct({
      name: "Topázio Imperial",
      sku: "TOP-COLIDE",
      mlTitle: "Topázio Imperial Natural 20cm",
      mlTitleApprovedAt: new Date(),
    });
    const target = await createProduct({ name: "Topázio Imperial", sku: "TOP-ALVO", weightGrams: 900, sizeCm: 20 });

    const res = await request(app).get(`/api/admin/mercadolivre/title-suggestions/${target.id}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.productId).toBe(target.id);
    expect(res.body.titleA).toBeTruthy();
    expect(res.body.collisions.length).toBeGreaterThan(0);
    expect(res.body.collisions[0]).toMatchObject({ productId: colliding.id, mlTitle: "Topázio Imperial Natural 20cm" });
  });

  it("404 para peça inexistente", async () => {
    const res = await request(app).get("/api/admin/mercadolivre/title-suggestions/inexistente").set(auth);
    expect(res.status).toBe(404);
  });

  it("sem token: 401", async () => {
    const product = await createProduct();
    const res = await request(app).get(`/api/admin/mercadolivre/title-suggestions/${product.id}`);
    expect(res.status).toBe(401);
  });
});

describe("listingBuilder — fonte única de título (resolveDraftTitle)", () => {
  function builderInput(overrides: Partial<ListingBuilderInput> = {}): ListingBuilderInput {
    return {
      id: "prod-x",
      name: "Citrino Lapidado",
      nameEn: null,
      sku: "CIT-001",
      description: "Peça lapidada.",
      descriptionEn: null,
      identificationPt: null,
      identificationEn: null,
      identificationTreatment: null,
      price: 700,
      active: true,
      trackStock: false,
      stockQty: null,
      weightGrams: 300,
      sizeCm: 9,
      mlTitle: null,
      mlTitleApprovedAt: null,
      images: [{ url: "https://r2.example/cit-1.jpg", position: 0, width: 1080, height: 1920 }],
      ...overrides,
    };
  }

  it("sem mlTitle aprovado: cai na sugestão A do titleGenerator, titleApproved false", () => {
    const draft = buildListingDraft(builderInput());
    expect(draft.titleApproved).toBe(false);
    // "Citrino" é material conhecido e o nome não diz "natural" — a
    // sugestão A acrescenta o sufixo (ver titleGenerator.ts).
    expect(draft.title).toContain("Natural");
    expect(getReadinessIssues(draft)).toContain("title_not_approved");
  });

  it("com mlTitle aprovado: usa o texto aprovado literalmente, titleApproved true", () => {
    const draft = buildListingDraft(
      builderInput({ mlTitle: "Citrino Lapidado Peça Única", mlTitleApprovedAt: new Date() })
    );
    expect(draft.titleApproved).toBe(true);
    expect(draft.title).toBe("Citrino Lapidado Peça Única");
    expect(getReadinessIssues(draft)).not.toContain("title_not_approved");
  });

  it("mlTitle preenchido SEM mlTitleApprovedAt ainda cai no fallback (nunca usa um título não aprovado)", () => {
    const draft = buildListingDraft(builderInput({ mlTitle: "Citrino Lapidado Peça Única", mlTitleApprovedAt: null }));
    expect(draft.titleApproved).toBe(false);
    expect(draft.title).not.toBe("Citrino Lapidado Peça Única");
  });
});
