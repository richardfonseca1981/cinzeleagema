import { describe, expect, it } from "vitest";
import { hasMorePages, mergeProductPages } from "./catalogPagination";
import type { Product } from "../types";

function makeProduct(id: string): Product {
  return {
    id,
    name: `Peça ${id}`,
    slug: `peca-${id}`,
    description: null,
    nameEn: null,
    descriptionEn: null,
    categoryId: "cat-1",
    subcategoryId: null,
    price: "100.00",
    sku: null,
    weightGrams: "10.00",
    sizeCm: "1.00",
    packageLengthCm: null,
    packageWidthCm: null,
    packageHeightCm: null,
    trackStock: false,
    stockQty: null,
    images: [],
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("mergeProductPages", () => {
  it("junta uma nova página ao final da lista já carregada", () => {
    const page1 = [makeProduct("1"), makeProduct("2")];
    const page2 = [makeProduct("3"), makeProduct("4")];

    const result = mergeProductPages(page1, page2);

    expect(result.map((p) => p.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("não duplica itens que já estavam carregados (defesa extra além da ordenação do backend)", () => {
    const page1 = [makeProduct("1"), makeProduct("2")];
    const pageWithOverlap = [makeProduct("2"), makeProduct("3")];

    const result = mergeProductPages(page1, pageWithOverlap);

    expect(result.map((p) => p.id)).toEqual(["1", "2", "3"]);
  });

  it("reiniciar a lista é só mesclar a partir de um array vazio (troca de categoria)", () => {
    const freshPage = [makeProduct("5"), makeProduct("6")];

    const result = mergeProductPages([], freshPage);

    expect(result.map((p) => p.id)).toEqual(["5", "6"]);
  });

  it("não quebra quando a nova página vem vazia", () => {
    const page1 = [makeProduct("1")];
    expect(mergeProductPages(page1, [])).toEqual(page1);
  });
});

describe("hasMorePages", () => {
  it("true quando ainda faltam itens a carregar", () => {
    expect(hasMorePages(20, 29)).toBe(true);
  });

  it("false quando já carregou tudo", () => {
    expect(hasMorePages(29, 29)).toBe(false);
  });

  it("false quando a lista está vazia (total 0)", () => {
    expect(hasMorePages(0, 0)).toBe(false);
  });

  it("false em qualquer excesso defensivo (carregado > total)", () => {
    expect(hasMorePages(30, 29)).toBe(false);
  });
});
