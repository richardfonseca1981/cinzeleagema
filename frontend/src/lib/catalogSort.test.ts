import { describe, expect, it } from "vitest";
import { CATALOG_SORTS, parseCatalogSort } from "./catalogSort";

describe("parseCatalogSort", () => {
  it.each(CATALOG_SORTS)("aceita o valor válido %s", (sort) => {
    expect(parseCatalogSort(sort)).toBe(sort);
  });

  it("cai em default quando o parâmetro não está na URL (null)", () => {
    expect(parseCatalogSort(null)).toBe("default");
  });

  it("cai em default com valor vazio", () => {
    expect(parseCatalogSort("")).toBe("default");
  });

  it("cai em default com valor desconhecido/inválido", () => {
    expect(parseCatalogSort("preco_crescente")).toBe("default");
  });
});
