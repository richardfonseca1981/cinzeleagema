import { describe, expect, it } from "vitest";
import { validateListing, ML_MIN_PHOTO_PX, type ListingValidationInput } from "../src/lib/mercadoLivre/listingValidator";

function baseProduct(overrides: Partial<ListingValidationInput> = {}): ListingValidationInput {
  return {
    id: "prod-1",
    name: "Topázio Imperial 3.1ct",
    nameEn: null,
    sku: "TOP-001",
    description: "Peça lapidada, brilho intenso.",
    descriptionEn: null,
    identificationPt: null,
    identificationEn: null,
    price: 4200,
    active: true,
    trackStock: false,
    stockQty: null,
    weightGrams: 0.62,
    sizeCm: 1.1,
    images: [{ width: 1080, height: 1920 }],
    ...overrides,
  };
}

describe("validateListing", () => {
  it("peça completa é apta, sem blockers", () => {
    const result = validateListing(baseProduct());
    expect(result.eligible).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("sempre inclui o aviso não-bloqueante de conferir a foto principal, quando há foto", () => {
    const result = validateListing(baseProduct());
    expect(result.warnings.map((w) => w.code)).toContain("review_photo_branding");
  });

  it("não inclui o aviso de foto quando a peça não tem nenhuma foto", () => {
    const result = validateListing(baseProduct({ images: [] }));
    expect(result.warnings).toEqual([]);
  });

  it("bloqueia peça inativa", () => {
    const result = validateListing(baseProduct({ active: false }));
    expect(result.eligible).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("inactive");
  });

  it("bloqueia peça com controle de estoque zerado", () => {
    const result = validateListing(baseProduct({ trackStock: true, stockQty: 0 }));
    expect(result.blockers.map((b) => b.code)).toContain("out_of_stock");
  });

  it("não bloqueia por estoque quando trackStock é false, mesmo sem stockQty", () => {
    const result = validateListing(baseProduct({ trackStock: false, stockQty: null }));
    expect(result.blockers.map((b) => b.code)).not.toContain("out_of_stock");
  });

  it("bloqueia nome provisório de importação em lote", () => {
    const result = validateListing(baseProduct({ name: "Pedra 1234 - Peso" }));
    expect(result.blockers.map((b) => b.code)).toContain("placeholder_title");
  });

  it("bloqueia preço ausente", () => {
    const result = validateListing(baseProduct({ price: null }));
    expect(result.blockers.map((b) => b.code)).toContain("missing_price");
  });

  it("bloqueia preço placeholder (<= R$1)", () => {
    const result = validateListing(baseProduct({ price: 1 }));
    expect(result.blockers.map((b) => b.code)).toContain("placeholder_price");
  });

  it("bloqueia peso zerado", () => {
    const result = validateListing(baseProduct({ weightGrams: 0 }));
    expect(result.blockers.map((b) => b.code)).toContain("missing_weight");
  });

  it("bloqueia tamanho zerado", () => {
    const result = validateListing(baseProduct({ sizeCm: 0 }));
    expect(result.blockers.map((b) => b.code)).toContain("missing_size");
  });

  it("bloqueia peça sem nenhuma foto", () => {
    const result = validateListing(baseProduct({ images: [] }));
    expect(result.blockers.map((b) => b.code)).toContain("no_photos");
  });

  it(`bloqueia foto abaixo de ${ML_MIN_PHOTO_PX}x${ML_MIN_PHOTO_PX}px`, () => {
    const result = validateListing(baseProduct({ images: [{ width: 499, height: 1920 }] }));
    expect(result.blockers.map((b) => b.code)).toContain("photo_too_small");
  });

  it("bloqueia foto sem dimensão registrada (legado, width/height null)", () => {
    const result = validateListing(baseProduct({ images: [{ width: null, height: null }] }));
    expect(result.blockers.map((b) => b.code)).toContain("photo_too_small");
  });

  it("acumula múltiplos blockers ao mesmo tempo", () => {
    const result = validateListing(baseProduct({ active: false, price: null, images: [] }));
    expect(result.blockers.map((b) => b.code).sort()).toEqual(["inactive", "missing_price", "no_photos"].sort());
  });
});
