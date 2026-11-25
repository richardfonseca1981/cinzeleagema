import { describe, expect, it } from "vitest";
import {
  buildBulkMoveItems,
  deselectIds,
  fetchAllMatchingProductIds,
  selectAllMatching,
  selectRange,
  toggleSelection,
} from "./categorization";
import type { Product } from "../types";

function fakeProduct(id: string): Product {
  return {
    id,
    name: id,
    slug: id,
    description: null,
    nameEn: null,
    descriptionEn: null,
    categoryId: null,
    subcategoryId: null,
    price: null,
    sku: null,
    weightGrams: "0",
    sizeCm: "0",
    packageLengthCm: null,
    packageWidthCm: null,
    packageHeightCm: null,
    trackStock: false,
    stockQty: null,
    images: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("toggleSelection", () => {
  it("adiciona quando ausente, remove quando presente", () => {
    expect(toggleSelection([], "a")).toEqual(["a"]);
    expect(toggleSelection(["a"], "a")).toEqual([]);
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
  });
});

describe("selectRange", () => {
  const visible = ["a", "b", "c", "d", "e"];

  it("seleciona o intervalo entre dois índices, nos dois sentidos", () => {
    expect(selectRange([], visible, 1, 3)).toEqual(["b", "c", "d"]);
    expect(selectRange([], visible, 3, 1)).toEqual(["b", "c", "d"]);
  });

  it("soma ao que já estava selecionado, nunca substitui", () => {
    expect(selectRange(["e"], visible, 0, 1)).toEqual(["e", "a", "b"]);
  });

  it("índice fora do intervalo não quebra (clamp implícito pelo length)", () => {
    expect(selectRange([], visible, 3, 10)).toEqual(["d", "e"]);
  });
});

describe("selectAllMatching", () => {
  it("soma todos os ids informados ao que já estava selecionado, sem duplicar", () => {
    expect(selectAllMatching(["a"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("deselectIds", () => {
  it("remove só os ids informados, preserva a ordem do resto", () => {
    expect(deselectIds(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });
});

describe("buildBulkMoveItems", () => {
  it("expande ids + um destino único no shape heterogêneo da API", () => {
    expect(buildBulkMoveItems(["p1", "p2"], "cat-1", "sub-1")).toEqual([
      { id: "p1", categoryId: "cat-1", subcategoryId: "sub-1" },
      { id: "p2", categoryId: "cat-1", subcategoryId: "sub-1" },
    ]);
  });

  it("destino 'Sem categoria' é categoryId/subcategoryId null", () => {
    expect(buildBulkMoveItems(["p1"], null, null)).toEqual([{ id: "p1", categoryId: null, subcategoryId: null }]);
  });
});

describe("fetchAllMatchingProductIds", () => {
  it("pagina até coletar todos os ids que casam com o filtro (não só a primeira página)", async () => {
    const all = Array.from({ length: 150 }, (_, i) => fakeProduct(`p${i}`));
    const listProducts = async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const start = (page - 1) * pageSize;
      return { items: all.slice(start, start + pageSize), total: all.length };
    };

    const ids = await fetchAllMatchingProductIds(listProducts);
    expect(ids).toHaveLength(150);
    expect(ids[0]).toBe("p0");
    expect(ids[149]).toBe("p149");
  });

  it("filtro sem resultado nenhum devolve array vazio, sem travar", async () => {
    const listProducts = async () => ({ items: [], total: 0 });
    expect(await fetchAllMatchingProductIds(listProducts)).toEqual([]);
  });
});
