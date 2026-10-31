import { describe, expect, it, vi } from "vitest";
import { fetchAllActiveProducts, filterPickerProducts, selectAllFiltered, toggleSelectedId } from "./catalogProductPicker";
import type { Product } from "../types";

function makeProduct(overrides: Partial<Product> & { id: string }): Product {
  return {
    name: null,
    slug: `slug-${overrides.id}`,
    description: null,
    nameEn: null,
    descriptionEn: null,
    categoryId: null,
    subcategoryId: null,
    category: null,
    subcategory: null,
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
    ...overrides,
  };
}

describe("fetchAllActiveProducts", () => {
  it("devolve tudo numa página só quando cabe", async () => {
    const items = [makeProduct({ id: "1" }), makeProduct({ id: "2" })];
    const listProducts = vi.fn().mockResolvedValue({ items, total: 2 });

    const result = await fetchAllActiveProducts(listProducts);
    expect(result).toEqual(items);
    expect(listProducts).toHaveBeenCalledTimes(1);
    expect(listProducts).toHaveBeenCalledWith({ active: true, page: 1, pageSize: 100 });
  });

  it("percorre várias páginas até juntar o total", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeProduct({ id: `p${i}` }));
    const page2 = [makeProduct({ id: "last" })];
    const listProducts = vi
      .fn()
      .mockResolvedValueOnce({ items: page1, total: 101 })
      .mockResolvedValueOnce({ items: page2, total: 101 });

    const result = await fetchAllActiveProducts(listProducts);
    expect(result).toHaveLength(101);
    expect(result.at(-1)?.id).toBe("last");
    expect(listProducts).toHaveBeenCalledTimes(2);
    expect(listProducts).toHaveBeenNthCalledWith(2, { active: true, page: 2, pageSize: 100 });
  });

  it("para se uma página vier vazia (evita loop infinito com total inconsistente)", async () => {
    const listProducts = vi.fn().mockResolvedValue({ items: [], total: 50 });
    const result = await fetchAllActiveProducts(listProducts);
    expect(result).toEqual([]);
    expect(listProducts).toHaveBeenCalledTimes(1);
  });
});

describe("filterPickerProducts", () => {
  const products = [
    makeProduct({ id: "1", name: "Esmeralda Colombiana", sku: "ESM-001", categoryId: "cat-pedras" }),
    makeProduct({ id: "2", name: "Ametista Uruguaia", sku: "AME-001", categoryId: "cat-pedras" }),
    makeProduct({ id: "3", name: "Vaso Decorativo", sku: "VASO-01", categoryId: "cat-decor" }),
  ];

  it("sem busca nem filtro, devolve tudo", () => {
    expect(filterPickerProducts(products, { search: "", categoryId: "" })).toHaveLength(3);
  });

  it("filtra por nome (case-insensitive)", () => {
    const result = filterPickerProducts(products, { search: "esmeralda", categoryId: "" });
    expect(result.map((p) => p.id)).toEqual(["1"]);
  });

  it("filtra por SKU/Ref", () => {
    const result = filterPickerProducts(products, { search: "AME-001", categoryId: "" });
    expect(result.map((p) => p.id)).toEqual(["2"]);
  });

  it("filtra por categoria", () => {
    const result = filterPickerProducts(products, { search: "", categoryId: "cat-decor" });
    expect(result.map((p) => p.id)).toEqual(["3"]);
  });

  it("combina busca e categoria", () => {
    const result = filterPickerProducts(products, { search: "ametista", categoryId: "cat-decor" });
    expect(result).toEqual([]);
  });
});

describe("toggleSelectedId", () => {
  it("adiciona um id ausente", () => {
    expect(toggleSelectedId(["a"], "b")).toEqual(["a", "b"]);
  });

  it("remove um id presente", () => {
    expect(toggleSelectedId(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("selectAllFiltered", () => {
  it("soma os ids filtrados ao que já estava selecionado, sem duplicar", () => {
    const filtered = [makeProduct({ id: "2" }), makeProduct({ id: "3" })];
    expect(selectAllFiltered(["1", "2"], filtered)).toEqual(["1", "2", "3"]);
  });
});
