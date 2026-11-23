import { describe, expect, it } from "vitest";
import {
  buildAvailableProductMeta,
  buildBreadcrumbJsonLd,
  buildCatalogMeta,
  buildHomeMeta,
  buildOrganizationJsonLd,
  buildProductJsonLd,
  buildUnavailableProductMeta,
  buildWebsiteJsonLd,
  renderPreviewHtml,
  SITE_NAME,
} from "../src/lib/seo/meta";

const SITE_URL = "https://www.cinzeleagema.com.br";

describe("buildHomeMeta/buildCatalogMeta", () => {
  it("home aponta para a raiz do site e para o og-default estático", () => {
    const meta = buildHomeMeta(SITE_URL);
    expect(meta.url).toBe(SITE_URL);
    expect(meta.image).toBe(`${SITE_URL}/og-default.jpg`);
    expect(meta.noindex).toBe(false);
  });

  it("catálogo aponta para /catalogo", () => {
    const meta = buildCatalogMeta(SITE_URL);
    expect(meta.url).toBe(`${SITE_URL}/catalogo`);
    expect(meta.noindex).toBe(false);
  });
});

describe("buildAvailableProductMeta", () => {
  it("monta title/description/og:image específicos da peça, indexável", () => {
    const meta = buildAvailableProductMeta(SITE_URL, {
      name: "Drusa de Ametista",
      weightSize: "2,77 kg · 22 cm",
      canonicalSlug: "drusa-de-ametista-8dnvub",
    });

    expect(meta.title).toBe(`Drusa de Ametista — ${SITE_NAME}`);
    expect(meta.description).toContain("Drusa de Ametista");
    expect(meta.description).toContain("2,77 kg · 22 cm");
    expect(meta.url).toBe(`${SITE_URL}/catalogo/drusa-de-ametista-8dnvub`);
    expect(meta.image).toBe(`${SITE_URL}/api/preview/og-image/drusa-de-ametista-8dnvub.jpg`);
    expect(meta.noindex).toBe(false);
  });

  it("sem peso/tamanho, description cai para a frase curta (mesma regra do Seo.tsx do frontend)", () => {
    const meta = buildAvailableProductMeta(SITE_URL, {
      name: "Esfera de Ágata",
      weightSize: null,
      canonicalSlug: "esfera-de-agata-abc123",
    });
    expect(meta.description).toBe(`Esfera de Ágata — pedra preciosa à venda na ${SITE_NAME}.`);
  });

  it("nunca menciona cor ou tratamento (mesma restrição da Rodada 1)", () => {
    const meta = buildAvailableProductMeta(SITE_URL, {
      name: "Ágata Azul",
      weightSize: "1 kg",
      canonicalSlug: "agata-azul-xyz999",
    });
    expect(meta.description.toLowerCase()).not.toContain("tingid");
    expect(meta.description.toLowerCase()).not.toContain("tratamento");
  });
});

describe("buildUnavailableProductMeta", () => {
  it("devolve metatags genéricas (mesmas da home), mas com a URL real da peça, e marca noindex", () => {
    const meta = buildUnavailableProductMeta(SITE_URL, "peca-vendida-abc123");
    const home = buildHomeMeta(SITE_URL);

    expect(meta.title).toBe(home.title);
    expect(meta.description).toBe(home.description);
    expect(meta.image).toBe(home.image);
    expect(meta.url).toBe(`${SITE_URL}/catalogo/peca-vendida-abc123`);
    expect(meta.noindex).toBe(true);
  });
});

describe("JSON-LD builders", () => {
  it("Organization e WebSite trazem nome e url do site, sem SearchAction (decisão desta rodada)", () => {
    const org = buildOrganizationJsonLd(SITE_URL);
    expect(org["@type"]).toBe("Organization");
    expect(org.url).toBe(SITE_URL);

    const website = buildWebsiteJsonLd(SITE_URL);
    expect(website["@type"]).toBe("WebSite");
    expect(website).not.toHaveProperty("potentialAction");
  });

  it("BreadcrumbList numera a partir de 1 na ordem recebida", () => {
    const breadcrumb = buildBreadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Pedras Brutas", url: `${SITE_URL}/catalogo?categoria=pedras-brutas` },
      { name: "Drusa de Ametista", url: `${SITE_URL}/catalogo/drusa-de-ametista-8dnvub` },
    ]);
    expect(breadcrumb.itemListElement).toHaveLength(3);
    expect(breadcrumb.itemListElement[0]).toMatchObject({ position: 1, name: "Home" });
    expect(breadcrumb.itemListElement[2]).toMatchObject({ position: 3, name: "Drusa de Ametista" });
  });

  it("Product sempre InStock/NewCondition (só é chamada para peça elegível)", () => {
    const product = buildProductJsonLd({
      name: "Drusa de Ametista",
      description: "Peça única.",
      sku: "108",
      price: 610,
      productImageUrl: "https://pub-x.r2.dev/foo.webp",
      canonicalUrl: `${SITE_URL}/catalogo/drusa-de-ametista-8dnvub`,
    });

    expect(product["@type"]).toBe("Product");
    expect(product.offers).toMatchObject({
      "@type": "Offer",
      priceCurrency: "BRL",
      price: 610,
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    });
  });
});

describe("renderPreviewHtml", () => {
  it("escapa title/description e embute os JSON-LD recebidos", () => {
    const meta = buildHomeMeta(SITE_URL);
    const html = renderPreviewHtml(meta, [buildOrganizationJsonLd(SITE_URL)]);

    expect(html).toContain(`<title>${SITE_NAME} — Pedras Preciosas</title>`);
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('"@type":"Organization"');
    expect(html).not.toContain('name="robots"');
  });

  it("inclui <meta name=\"robots\" content=\"noindex, follow\"> quando noindex=true", () => {
    const meta = buildUnavailableProductMeta(SITE_URL, "peca-vendida-abc123");
    const html = renderPreviewHtml(meta);
    expect(html).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it("escapa caracteres HTML perigosos no title/description", () => {
    const meta = buildAvailableProductMeta(SITE_URL, {
      name: 'Pedra "Especial" <teste>',
      weightSize: null,
      canonicalSlug: "pedra-especial-abc123",
    });
    const html = renderPreviewHtml(meta);
    expect(html).not.toContain("<teste>");
    expect(html).toContain("&lt;teste&gt;");
  });

  it("escapa '</script' dentro do JSON-LD para não fechar a tag antes da hora", () => {
    const meta = buildHomeMeta(SITE_URL);
    const malicious = { "@type": "Thing", name: "</script><script>alert(1)</script>" };
    const html = renderPreviewHtml(meta, [malicious]);
    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).toContain("\\u003c/script>\\u003cscript>alert(1)\\u003c/script>");
  });
});
