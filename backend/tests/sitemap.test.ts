import { describe, expect, it } from "vitest";
import { buildSitemapUrls, renderSitemapXml, type SitemapProduct } from "../src/lib/sitemap";

function product(overrides: Partial<SitemapProduct> = {}): SitemapProduct {
  return {
    id: "cm-base-id-a1b2c3",
    name: "Ametista Bruta",
    nameEn: null,
    sku: "SKU-1",
    description: null,
    descriptionEn: null,
    identificationPt: null,
    identificationEn: null,
    price: 1500,
    active: true,
    trackStock: false,
    stockQty: null,
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

describe("buildSitemapUrls", () => {
  it("inclui / e /catalogo mesmo sem nenhuma peça elegível", () => {
    const urls = buildSitemapUrls([], new Date("2026-11-12T00:00:00Z"));
    expect(urls.map((u) => u.path)).toEqual(["/", "/catalogo"]);
    expect(urls.every((u) => u.lastmod === "2026-11-12")).toBe(true);
  });

  it("inclui uma peça elegível com o slug nome+sufixo e o lastmod da própria peça", () => {
    const p = product({ id: "cm-xxxx-a1b2c3", name: "Ametista Bruta", updatedAt: new Date("2026-09-20T00:00:00Z") });
    const urls = buildSitemapUrls([p]);
    const productUrl = urls.find((u) => u.path.startsWith("/catalogo/"));
    expect(productUrl).toEqual({ path: "/catalogo/ametista-bruta-a1b2c3", lastmod: "2026-09-20" });
  });

  it("exclui peça inativa, com nome provisório ou com preço <= R$ 1,00 — conta quantas entram e quantas saem", () => {
    const active = product({ id: "cm-ok-1-a1b2c3", price: 1500 });
    const inactive = product({ id: "cm-off-2-b2c3d4", active: false });
    const placeholderName = product({ id: "cm-off-3-c3d4e5", name: "Pedra 9999 - Peso" });
    const placeholderPrice = product({ id: "cm-off-4-d4e5f6", price: 1 });

    const urls = buildSitemapUrls([active, inactive, placeholderName, placeholderPrice]);
    const productUrls = urls.filter((u) => u.path.startsWith("/catalogo/"));

    expect(productUrls).toHaveLength(1);
    expect(productUrls[0].path).toBe("/catalogo/ametista-bruta-a1b2c3");
  });

  it("estático (/ e /catalogo) usa o lastmod mais recente entre as peças elegíveis", () => {
    const older = product({ id: "cm-older-a1b2c3", updatedAt: new Date("2026-01-01T00:00:00Z") });
    const newer = product({ id: "cm-newer-b2c3d4", updatedAt: new Date("2026-10-15T00:00:00Z") });
    const urls = buildSitemapUrls([older, newer]);
    expect(urls.find((u) => u.path === "/")?.lastmod).toBe("2026-10-15");
    expect(urls.find((u) => u.path === "/catalogo")?.lastmod).toBe("2026-10-15");
  });
});

describe("renderSitemapXml", () => {
  it("gera XML válido com host absoluto e sem barra duplicada", () => {
    const xml = renderSitemapXml([{ path: "/catalogo", lastmod: "2026-11-12" }], "https://www.cinzeleagema.com.br/");
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
    expect(xml).toContain("<loc>https://www.cinzeleagema.com.br/catalogo</loc>");
    expect(xml).toContain("<lastmod>2026-11-12</lastmod>");
    expect(xml).not.toContain("//catalogo");
  });

  it("escapa caracteres especiais no loc", () => {
    const xml = renderSitemapXml([{ path: "/catalogo/ametista-bruta-a&b", lastmod: "2026-11-12" }], "https://www.cinzeleagema.com.br");
    expect(xml).toContain("a&amp;b");
  });
});
