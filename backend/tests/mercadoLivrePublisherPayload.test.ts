import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/lib/env";
import { ListingNotReadyError } from "../src/lib/mercadoLivre/listingBuilder";
import {
  assemblePayload,
  buildMercadoLivreItemPayload,
  MercadoLivrePublishConfigError,
  type MercadoLivrePublishableProduct,
} from "../src/lib/mercadoLivre/publisherPayload";

function baseProduct(overrides: Partial<MercadoLivrePublishableProduct> = {}): MercadoLivrePublishableProduct {
  return {
    id: "prod-1",
    name: "Esmeralda Colombiana 2.3ct",
    nameEn: null,
    sku: "ESM-001",
    description: "Peça lapidada, brilho intenso.",
    descriptionEn: null,
    identificationPt: null,
    identificationEn: null,
    identificationTreatment: null,
    price: 1200,
    active: true,
    trackStock: false,
    stockQty: null,
    weightGrams: 850,
    sizeCm: 23,
    images: [{ url: "https://r2.example/esm-1.webp", position: 0, width: 1080, height: 1920 }],
    ...overrides,
  };
}

describe("buildMercadoLivreItemPayload", () => {
  const originalListingTypeId = env.ML_LISTING_TYPE_ID;

  beforeEach(() => {
    env.ML_LISTING_TYPE_ID = "gold_special";
  });

  afterEach(() => {
    env.ML_LISTING_TYPE_ID = originalListingTypeId;
  });

  it("lança MercadoLivrePublishConfigError quando ML_LISTING_TYPE_ID não está configurado, antes de checar a peça", () => {
    env.ML_LISTING_TYPE_ID = "";
    expect(() => buildMercadoLivreItemPayload({ product: baseProduct(), listingPriceBRL: 1500 })).toThrow(MercadoLivrePublishConfigError);
  });

  it("lança ListingNotReadyError para preço de anúncio inválido (<=0), com config e peça válidas", () => {
    expect(() => buildMercadoLivreItemPayload({ product: baseProduct(), listingPriceBRL: 0 })).toThrow(ListingNotReadyError);
    expect(() => buildMercadoLivreItemPayload({ product: baseProduct(), listingPriceBRL: -10 })).toThrow(ListingNotReadyError);
    expect(() => buildMercadoLivreItemPayload({ product: baseProduct(), listingPriceBRL: NaN })).toThrow(ListingNotReadyError);
  });

  it("lança ListingNotReadyError quando a peça não é elegível (ex.: sem preço cadastrado), com config e listingPriceBRL válidos", () => {
    let error: unknown;
    try {
      buildMercadoLivreItemPayload({ product: baseProduct({ price: null }), listingPriceBRL: 1500 });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ListingNotReadyError);
    expect((error as Error).message).toContain("missing_price");
  });

  it("lança ListingNotReadyError pela categoria placeholder não verificada, mesmo com config/preço/elegibilidade OK — nunca monta payload parcial", () => {
    let error: unknown;
    let threw = false;
    try {
      buildMercadoLivreItemPayload({ product: baseProduct(), listingPriceBRL: 1500 });
    } catch (err) {
      threw = true;
      error = err;
    }
    expect(threw).toBe(true);
    expect(error).toBeInstanceOf(ListingNotReadyError);
    expect((error as Error).message).toMatch(/categoria/i);
  });
});

// assemblePayload é a montagem PURA dos campos, testada isoladamente com um
// draft construído à mão (categoria "verificada" fake) — a categoria real
// desta fase (ver categoryFixture.ts) sempre bloqueia buildMercadoLivreItemPayload
// antes de chegar aqui, então é o único jeito de testar o FORMATO do
// payload (SKU, fotos como URL pública, listing_type_id de configuração)
// sem esperar a categoria ser confirmada numa fase futura.
describe("assemblePayload", () => {
  const verifiedDraft = {
    title: "Esmeralda Colombiana 2.3ct",
    titleTruncated: false,
    description: "Peça lapidada, brilho intenso.",
    photos: ["https://r2.example/esm-1.webp", "https://r2.example/esm-2.webp"],
    photosOmitted: 0,
    category: { id: "MLB123456", breadcrumb: ["Joias e Relógios", "Pedras Preciosas", "Gemas Brutas"], verified: true },
  };

  it("monta todos os campos fixos corretamente (currency_id BRL, available_quantity 1, buying_mode, condition)", () => {
    const payload = assemblePayload(verifiedDraft, "ESM-001", 1500, "gold_special");
    expect(payload.currency_id).toBe("BRL");
    expect(payload.available_quantity).toBe(1);
    expect(payload.buying_mode).toBe("buy_it_now");
    expect(payload.condition).toBe("new");
    expect(payload.title).toBe(verifiedDraft.title);
    expect(payload.category_id).toBe("MLB123456");
    expect(payload.price).toBe(1500);
  });

  it("listing_type_id vem do parâmetro de configuração — nunca um valor fixo no código", () => {
    expect(assemblePayload(verifiedDraft, "ESM-001", 1500, "gold_special").listing_type_id).toBe("gold_special");
    expect(assemblePayload(verifiedDraft, "ESM-001", 1500, "gold_pro").listing_type_id).toBe("gold_pro");
  });

  it("pictures usa as URLs públicas do draft (R2), uma por foto, na mesma ordem", () => {
    const payload = assemblePayload(verifiedDraft, "ESM-001", 1500, "gold_special");
    expect(payload.pictures).toEqual([{ source: "https://r2.example/esm-1.webp" }, { source: "https://r2.example/esm-2.webp" }]);
  });

  it("inclui seller_custom_field com o SKU quando informado", () => {
    const payload = assemblePayload(verifiedDraft, "ESM-001", 1500, "gold_special");
    expect(payload.seller_custom_field).toBe("ESM-001");
  });

  it("omite seller_custom_field quando a peça não tem SKU — nunca manda string vazia/null", () => {
    const payload = assemblePayload(verifiedDraft, null, 1500, "gold_special");
    expect(payload.seller_custom_field).toBeUndefined();
    expect("seller_custom_field" in payload).toBe(false);
  });
});
