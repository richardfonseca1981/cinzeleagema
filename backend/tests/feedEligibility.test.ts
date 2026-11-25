import { describe, expect, it } from "vitest";
import { evaluateFeedEligibility, isEligibleForFeed, type FeedEligibilityInput } from "../src/lib/feed/feedEligibility";

function product(overrides: Partial<FeedEligibilityInput> = {}): FeedEligibilityInput {
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
    images: [{ url: "https://pub-r2.example.com/foto1.webp" }],
    ...overrides,
  };
}

describe("evaluateFeedEligibility", () => {
  it("peça completa (ativa, com nome, preço real e foto) é elegível", () => {
    expect(evaluateFeedEligibility(product())).toEqual({ eligible: true, reason: null });
    expect(isEligibleForFeed(product())).toBe(true);
  });

  it("peça inativa é excluída com motivo 'inactive'", () => {
    expect(evaluateFeedEligibility(product({ active: false }))).toEqual({ eligible: false, reason: "inactive" });
  });

  it("peça com controle de estoque zerado é excluída com motivo 'out_of_stock'", () => {
    expect(evaluateFeedEligibility(product({ trackStock: true, stockQty: 0 }))).toEqual({
      eligible: false,
      reason: "out_of_stock",
    });
    expect(evaluateFeedEligibility(product({ trackStock: true, stockQty: null }))).toEqual({
      eligible: false,
      reason: "out_of_stock",
    });
  });

  it("peça com controle de estoque e unidade disponível é elegível", () => {
    expect(isEligibleForFeed(product({ trackStock: true, stockQty: 1 }))).toBe(true);
  });

  it("peça sem nome é excluída com motivo 'placeholder_title' (decisão: nunca entra, mesmo com preço/foto)", () => {
    expect(evaluateFeedEligibility(product({ name: null }))).toEqual({ eligible: false, reason: "placeholder_title" });
    expect(evaluateFeedEligibility(product({ name: "" }))).toEqual({ eligible: false, reason: "placeholder_title" });
    expect(evaluateFeedEligibility(product({ name: "   " }))).toEqual({ eligible: false, reason: "placeholder_title" });
  });

  it("nome provisório de importação em lote ('Pedra NNNN - Peso') é excluído com motivo 'placeholder_title'", () => {
    expect(evaluateFeedEligibility(product({ name: "Pedra 1234 - Peso" }))).toEqual({
      eligible: false,
      reason: "placeholder_title",
    });
    expect(evaluateFeedEligibility(product({ name: "Stone 1234 - Weight" }))).toEqual({
      eligible: false,
      reason: "placeholder_title",
    });
  });

  it("nome provisório COM identificação title-like disponível deixa de ser placeholder", () => {
    expect(
      isEligibleForFeed(product({ name: "Pedra 1234 - Peso", identificationPt: "Ágata Azul (Tingida)" }))
    ).toBe(true);
  });

  it("preço null ('Consulte o valor') é excluído com motivo 'missing_price' — diferente do sitemap, que aceita", () => {
    expect(evaluateFeedEligibility(product({ price: null }))).toEqual({ eligible: false, reason: "missing_price" });
  });

  it("preço provisório (<= R$ 1,00) é excluído com motivo 'missing_price'", () => {
    expect(evaluateFeedEligibility(product({ price: 1 }))).toEqual({ eligible: false, reason: "missing_price" });
    expect(evaluateFeedEligibility(product({ price: 0 }))).toEqual({ eligible: false, reason: "missing_price" });
  });

  it("preço real acima de R$ 1,00 é elegível (quanto ao preço)", () => {
    expect(isEligibleForFeed(product({ price: 1.01 }))).toBe(true);
  });

  it("peça sem nenhuma foto é excluída com motivo 'missing_image'", () => {
    expect(evaluateFeedEligibility(product({ images: [] }))).toEqual({ eligible: false, reason: "missing_image" });
  });

  it("prioridade dos motivos: inativa prevalece mesmo se também sem foto/preço", () => {
    expect(evaluateFeedEligibility(product({ active: false, images: [], price: null }))).toEqual({
      eligible: false,
      reason: "inactive",
    });
  });
});
