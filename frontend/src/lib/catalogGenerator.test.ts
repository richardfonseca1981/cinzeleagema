import { describe, expect, it } from "vitest";
import { buildCatalogJobRequest, formatCatalogBytes, staleRateWarning, type CatalogFormState } from "./catalogGenerator";

function baseState(overrides: Partial<CatalogFormState> = {}): CatalogFormState {
  return {
    scope: "all",
    selectedIds: [],
    language: "pt",
    showPrice: true,
    showRef: true,
    dividers: "auto",
    includeContactPage: true,
    quality: "standard",
    ...overrides,
  };
}

describe("buildCatalogJobRequest", () => {
  it("scope 'all' não manda productIds", () => {
    const body = buildCatalogJobRequest(baseState({ scope: "all", selectedIds: ["1", "2"] }));
    expect(body.productIds).toBeUndefined();
  });

  it("scope 'selected' manda os ids escolhidos", () => {
    const body = buildCatalogJobRequest(baseState({ scope: "selected", selectedIds: ["1", "2"] }));
    expect(body.productIds).toEqual(["1", "2"]);
  });

  it("dividers 'auto' não manda includeCategoryDividers (deixa o backend decidir)", () => {
    const body = buildCatalogJobRequest(baseState({ dividers: "auto" }));
    expect(body.includeCategoryDividers).toBeUndefined();
  });

  it("dividers 'yes'/'no' mandam o booleano explícito", () => {
    expect(buildCatalogJobRequest(baseState({ dividers: "yes" })).includeCategoryDividers).toBe(true);
    expect(buildCatalogJobRequest(baseState({ dividers: "no" })).includeCategoryDividers).toBe(false);
  });

  it("repassa idioma, preço, ref, contato e qualidade como estão", () => {
    const body = buildCatalogJobRequest(
      baseState({ language: "en", showPrice: false, showRef: false, includeContactPage: false, quality: "light" })
    );
    expect(body).toMatchObject({ language: "en", showPrice: false, showRef: false, includeContactPage: false, quality: "light" });
  });
});

describe("formatCatalogBytes", () => {
  it("menos de 1 MB vira KB", () => {
    expect(formatCatalogBytes(500 * 1024)).toBe("500.0 KB");
  });

  it("1 MB ou mais vira MB", () => {
    expect(formatCatalogBytes(11.62 * 1024 * 1024)).toBe("11.62 MB");
  });
});

describe("staleRateWarning", () => {
  it("sem cotação (preço oculto ou PT), não avisa nada", () => {
    expect(staleRateWarning({ rate: null, rateSource: null, rateUpdatedAt: null })).toBeNull();
  });

  it("cotação 'live' e recente, não avisa", () => {
    const now = new Date().toISOString();
    expect(staleRateWarning({ rate: 5.3, rateSource: "live", rateUpdatedAt: now })).toBeNull();
  });

  it("cotação 'stale' avisa com o valor e a data", () => {
    const message = staleRateWarning({ rate: 5.3, rateSource: "stale", rateUpdatedAt: "2026-10-20T14:32:00.000Z" });
    expect(message).toContain("Cotação do dólar desatualizada");
    expect(message).toContain("R$ 5,30");
  });

  it("cotação 'fallback' avisa mesmo sem data", () => {
    const message = staleRateWarning({ rate: 5.3, rateSource: "fallback", rateUpdatedAt: null });
    expect(message).toContain("R$ 5,30");
  });
});
