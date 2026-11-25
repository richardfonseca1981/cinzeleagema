import { describe, expect, it } from "vitest";
import { buildFeedItem, buildFeedItems, renderGoogleFeedXml, type FeedProduct } from "../src/lib/feed/googleFeed";

function product(overrides: Partial<FeedProduct> = {}): FeedProduct {
  return {
    id: "cmxxxxxxxxxxa1b2c3",
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
    weightGrams: 0,
    images: [{ url: "https://pub-r2.example.com/foto1.webp" }],
    category: { slug: "pedras-brutas", name: "Pedras Brutas" },
    subcategory: null,
    ...overrides,
  };
}

const SITE_URL = "https://www.cinzeleagema.com.br";

describe("buildFeedItem", () => {
  it("monta o item com link canônico (sem UTM) usando o slug público", () => {
    const item = buildFeedItem(product({ id: "cm-base-id-a1b2c3", name: "Ametista Bruta" }), SITE_URL);
    expect(item.link).toBe("https://www.cinzeleagema.com.br/catalogo/ametista-bruta-a1b2c3");
    expect(item.link).not.toContain("utm_");
    expect(item.link).not.toContain("?");
  });

  it("imagem principal é a primeira (posição 0) e as demais vão para additionalImageLinks", () => {
    const item = buildFeedItem(
      product({
        images: [{ url: "https://r2/foto-capa.webp" }, { url: "https://r2/foto-2.webp" }, { url: "https://r2/foto-3.webp" }],
      }),
      SITE_URL
    );
    expect(item.imageLink).toBe("https://r2/foto-capa.webp");
    expect(item.additionalImageLinks).toEqual(["https://r2/foto-2.webp", "https://r2/foto-3.webp"]);
  });

  it("limita additionalImageLinks a 10 fotos (limite documentado do Google)", () => {
    const images = Array.from({ length: 15 }, (_, i) => ({ url: `https://r2/foto-${i}.webp` }));
    const item = buildFeedItem(product({ images }), SITE_URL);
    expect(item.additionalImageLinks).toHaveLength(10);
  });

  it("preço formatado como número decimal + ' BRL'", () => {
    const item = buildFeedItem(product({ price: 1234 }), SITE_URL);
    expect(item.priceBRL).toBe(1234);
  });

  it("peso em gramas > 0 é convertido para kg; peso 0 ('não informado') vira null", () => {
    expect(buildFeedItem(product({ weightGrams: 250 }), SITE_URL).weightKg).toBeCloseTo(0.25);
    expect(buildFeedItem(product({ weightGrams: 0 }), SITE_URL).weightKg).toBeNull();
  });

  it("product_type combina categoria e subcategoria; sem subcategoria usa só a categoria", () => {
    const withSub = buildFeedItem(
      product({ category: { slug: "pedras-brutas", name: "Pedras Brutas" }, subcategory: { name: "Pedras Exclusivas" } }),
      SITE_URL
    );
    expect(withSub.productType).toBe("Pedras Brutas > Pedras Exclusivas");

    const withoutSub = buildFeedItem(product({ subcategory: null }), SITE_URL);
    expect(withoutSub.productType).toBe("Pedras Brutas");

    const withoutCategory = buildFeedItem(product({ category: null, subcategory: null }), SITE_URL);
    expect(withoutCategory.productType).toBeNull();
  });

  it("google_product_category vem do mapa por slug de categoria; categoria sem mapeamento fica null", () => {
    const mapped = buildFeedItem(product({ category: { slug: "pedras-brutas", name: "Pedras Brutas" } }), SITE_URL);
    expect(mapped.googleProductCategory).toContain("Loose Stones");

    const unmapped = buildFeedItem(product({ category: { slug: "categoria-inexistente", name: "X" } }), SITE_URL);
    expect(unmapped.googleProductCategory).toBeNull();

    const noCategory = buildFeedItem(product({ category: null }), SITE_URL);
    expect(noCategory.googleProductCategory).toBeNull();
  });

  it("título e descrição truncados nos limites do Google (150 / 5000)", () => {
    const longName = "A".repeat(200);
    const longDescription = "B".repeat(6000);
    const item = buildFeedItem(product({ name: longName, description: longDescription }), SITE_URL);
    expect(item.title.length).toBeLessThanOrEqual(150);
    expect(item.description.length).toBeLessThanOrEqual(5000);
  });

  it("sem description própria, cai para o título (nunca manda <description> vazia)", () => {
    const item = buildFeedItem(product({ description: null, identificationPt: null }), SITE_URL);
    expect(item.description).toBe(item.title);
  });
});

describe("buildFeedItems", () => {
  it("filtra peças não elegíveis (reaproveita evaluateFeedEligibility) e só monta item das elegíveis", () => {
    const eligible = product({ id: "cm-ok-a1b2c3" });
    const inactive = product({ id: "cm-off-b2c3d4", active: false });
    const noPrice = product({ id: "cm-off-c3d4e5", price: null });
    const noPhoto = product({ id: "cm-off-d4e5f6", images: [] });

    const items = buildFeedItems([eligible, inactive, noPrice, noPhoto], SITE_URL);
    expect(items.map((i) => i.id)).toEqual(["cm-ok-a1b2c3"]);
  });
});

describe("renderGoogleFeedXml", () => {
  it("gera RSS 2.0 válido com namespace g: e os campos obrigatórios", () => {
    const items = buildFeedItems([product()], SITE_URL);
    const xml = renderGoogleFeedXml(items, SITE_URL);

    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(xml).toContain("<g:id>cmxxxxxxxxxxa1b2c3</g:id>");
    expect(xml).toContain("<g:availability>in stock</g:availability>");
    expect(xml).toContain("<g:price>1500.00 BRL</g:price>");
    expect(xml).toContain("<g:condition>new</g:condition>");
    expect(xml).toContain("<g:identifier_exists>false</g:identifier_exists>");
    expect(xml).toContain("<g:brand>Cinzel e a Gema</g:brand>");
  });

  it("escapa caracteres especiais em título/descrição (& < > \" ')", () => {
    const items = buildFeedItems(
      [product({ name: 'Pedra "Única" & Rara <especial>', description: "Peça com 'aspas' & sinais <raros>" })],
      SITE_URL
    );
    const xml = renderGoogleFeedXml(items, SITE_URL);

    expect(xml).not.toContain('"Única"');
    expect(xml).not.toContain("<especial>");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;especial&gt;");
    expect(xml).toContain("&quot;");
    expect(xml).toContain("&apos;");
  });

  it("sem peça elegível gera canal vazio (sem <item>), nunca quebra o XML", () => {
    const xml = renderGoogleFeedXml([], SITE_URL);
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });

  it("peça vendida (desativada) não aparece no XML final", () => {
    const sold = product({ id: "cm-vendida-a1b2c3", active: false });
    const items = buildFeedItems([sold], SITE_URL);
    const xml = renderGoogleFeedXml(items, SITE_URL);
    expect(xml).not.toContain("cm-vendida-a1b2c3");
  });
});
