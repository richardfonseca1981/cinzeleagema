import { describe, expect, it } from "vitest";
import { isEligibleForSitemap, type SitemapEligibilityInput } from "../src/lib/sitemapEligibility";

function product(overrides: Partial<SitemapEligibilityInput> = {}): SitemapEligibilityInput {
  return {
    id: "cm-base-id",
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
    ...overrides,
  };
}

describe("isEligibleForSitemap", () => {
  it("peça normal (ativa, nome e preço reais) é elegível", () => {
    expect(isEligibleForSitemap(product())).toBe(true);
  });

  it("peça inativa nunca é elegível", () => {
    expect(isEligibleForSitemap(product({ active: false }))).toBe(false);
  });

  it("nome provisório de importação em lote ('Pedra NNNN - Peso') não é elegível", () => {
    expect(isEligibleForSitemap(product({ name: "Pedra 1234 - Peso" }))).toBe(false);
    expect(isEligibleForSitemap(product({ name: "Stone 1234 - Weight" }))).toBe(false);
  });

  it("preço provisório (<= R$ 1,00) não é elegível", () => {
    expect(isEligibleForSitemap(product({ price: 1 }))).toBe(false);
    expect(isEligibleForSitemap(product({ price: 0 }))).toBe(false);
  });

  it("preço real acima de R$ 1,00 é elegível", () => {
    expect(isEligibleForSitemap(product({ price: 1.01 }))).toBe(true);
  });

  it("preço null ('Consulte o valor') não é tratado como placeholder", () => {
    expect(isEligibleForSitemap(product({ price: null }))).toBe(true);
  });

  it("peça com controle de estoque e sem unidade disponível não é elegível", () => {
    expect(isEligibleForSitemap(product({ trackStock: true, stockQty: 0 }))).toBe(false);
    expect(isEligibleForSitemap(product({ trackStock: true, stockQty: null }))).toBe(false);
  });

  it("peça com controle de estoque e unidade disponível é elegível", () => {
    expect(isEligibleForSitemap(product({ trackStock: true, stockQty: 1 }))).toBe(true);
  });

  it("nome provisório COM identificação title-like disponível deixa de ser placeholder (mesma regra do catálogo em PDF)", () => {
    expect(
      isEligibleForSitemap(
        product({ name: "Pedra 1234 - Peso", identificationPt: "Ágata Azul (Tingida)" })
      )
    ).toBe(true);
  });
});
