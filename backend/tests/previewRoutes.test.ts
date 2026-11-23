import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import "./setup";

vi.mock("../src/lib/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/r2")>();
  return { ...actual, getObject: vi.fn() };
});

import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import * as r2 from "../src/lib/r2";
import { cleanDatabase } from "./helpers";
import { buildPublicSlug } from "../src/lib/publicSlug";

const mockedGetObject = vi.mocked(r2.getObject);

async function makePortraitPhoto(): Promise<Buffer> {
  return sharp({ create: { width: 1080, height: 1920, channels: 3, background: { r: 120, g: 60, b: 180 } } })
    .webp()
    .toBuffer();
}

const app = createApp();

let categoryId: string;

beforeEach(async () => {
  await cleanDatabase();
  const category = await prisma.category.create({ data: { name: "Homedecor", slug: "homedecor" } });
  categoryId = category.id;
});

afterEach(() => {
  mockedGetObject.mockReset();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("GET /api/preview/", () => {
  it("devolve HTML com Organization/WebSite JSON-LD e og-image estático", async () => {
    const res = await request(app).get("/api/preview/");
    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html");
    expect(res.text).toContain('"@type":"Organization"');
    expect(res.text).toContain('"@type":"WebSite"');
    expect(res.text).toContain("/og-default.jpg");
    expect(res.text).not.toContain('name="robots"');
  });
});

describe("GET /api/preview/catalogo", () => {
  it("devolve HTML com BreadcrumbList Home > Catálogo", async () => {
    const res = await request(app).get("/api/preview/catalogo");
    expect(res.status).toBe(200);
    expect(res.text).toContain('"@type":"BreadcrumbList"');
    expect(res.text).toContain("Catálogo");
  });
});

describe("GET /api/preview/catalogo/:slugComId", () => {
  it("peça disponível: title/description da peça, breadcrumb e Product JSON-LD", async () => {
    const product = await prisma.product.create({
      data: { name: "Drusa de Ametista", slug: "drusa-de-ametista", price: 610, categoryId, weightGrams: 2770, sizeCm: 22 },
    });
    const slug = buildPublicSlug(product.name, product.id);

    const res = await request(app).get(`/api/preview/catalogo/${slug}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain(`<title>Drusa de Ametista — Cinzel e a Gema</title>`);
    expect(res.text).toContain('"@type":"BreadcrumbList"');
    expect(res.text).toContain('"@type":"Product"');
    expect(res.text).toContain('"price":610');
    expect(res.text).not.toContain('name="robots"');
  });

  it("peça sem preço (\"Consulte o valor\"): sem Product JSON-LD, mas com breadcrumb", async () => {
    const product = await prisma.product.create({
      data: { name: "Esfera de Ágata", slug: "esfera-de-agata", categoryId },
    });
    const slug = buildPublicSlug(product.name, product.id);

    const res = await request(app).get(`/api/preview/catalogo/${slug}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('"@type":"BreadcrumbList"');
    expect(res.text).not.toContain('"@type":"Product"');
  });

  it("peça inativa: metatags genéricas (mesmas da home) e noindex", async () => {
    const product = await prisma.product.create({
      data: { name: "Peça Vendida", slug: "peca-vendida", price: 610, categoryId, active: false },
    });
    const slug = buildPublicSlug(product.name, product.id);

    const res = await request(app).get(`/api/preview/catalogo/${slug}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('<meta name="robots" content="noindex, follow" />');
    expect(res.text).toContain("Cinzel e a Gema — Pedras Preciosas");
    expect(res.text).not.toContain('"@type":"Product"');
  });

  it("sufixo sem nenhuma peça correspondente devolve 404", async () => {
    const res = await request(app).get("/api/preview/catalogo/peca-inexistente-ffffff");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/preview/og-image/:fileName", () => {
  it("peça disponível com foto: gera JPEG 1200x630 a partir da capa", async () => {
    const product = await prisma.product.create({
      data: { name: "Drusa de Ametista", slug: "drusa-de-ametista-2", price: 610, categoryId },
    });
    await prisma.productImage.create({
      data: { productId: product.id, url: "https://pub-x.r2.dev/foo.webp", key: "products/foo.webp", position: 0 },
    });
    mockedGetObject.mockResolvedValue(await makePortraitPhoto());

    const slug = buildPublicSlug(product.name, product.id);
    const res = await request(app).get(`/api/preview/og-image/${slug}.jpg`);

    expect(res.status).toBe(200);
    expect(res.type).toBe("image/jpeg");
    const meta = await sharp(res.body).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });

  it("peça sem foto cai para og-default.jpg (redirect)", async () => {
    const product = await prisma.product.create({
      data: { name: "Sem Foto", slug: "sem-foto", price: 610, categoryId },
    });
    const slug = buildPublicSlug(product.name, product.id);

    const res = await request(app).get(`/api/preview/og-image/${slug}.jpg`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/og-default.jpg");
  });

  it("peça indisponível (inativa) cai para og-default.jpg mesmo tendo foto", async () => {
    const product = await prisma.product.create({
      data: { name: "Inativa Com Foto", slug: "inativa-com-foto", price: 610, categoryId, active: false },
    });
    await prisma.productImage.create({
      data: { productId: product.id, url: "https://pub-x.r2.dev/foo.webp", key: "products/foo.webp", position: 0 },
    });
    const slug = buildPublicSlug(product.name, product.id);

    const res = await request(app).get(`/api/preview/og-image/${slug}.jpg`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/og-default.jpg");
    expect(mockedGetObject).not.toHaveBeenCalled();
  });

  it("sufixo sem peça correspondente cai para og-default.jpg", async () => {
    const res = await request(app).get("/api/preview/og-image/peca-inexistente-ffffff.jpg");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/og-default.jpg");
  });
});
