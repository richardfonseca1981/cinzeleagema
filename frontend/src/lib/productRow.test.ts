import { describe, expect, it } from "vitest";
import { coverImage, mergeUpdatedProduct } from "./productRow";
import type { Product } from "../types";

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: "p1",
    name: "Quartzo",
    active: true,
    images: [{ id: "i1", url: "u", key: "k", position: 0, width: 720, height: 1280 }],
    category: { id: "c", name: "Homedecor", slug: "homedecor" },
    ...over,
  }) as Product;

describe("coverImage", () => {
  it("devolve a primeira foto; sem images (ou vazio) não quebra", () => {
    expect(coverImage(product())?.id).toBe("i1");
    expect(coverImage({ images: [] })).toBeUndefined();
    expect(coverImage({} as Pick<Product, "images">)).toBeUndefined();
  });
});

describe("mergeUpdatedProduct (regressão: desativar peça deixava a tela branca)", () => {
  it("resposta SEM images mantém as fotos e a categoria da linha", () => {
    const updated = { id: "p1", active: false } as Partial<Product> & { id: string };
    const [row] = mergeUpdatedProduct([product()], updated);
    expect(row.active).toBe(false);
    expect(row.images).toHaveLength(1);
    expect(row.category?.slug).toBe("homedecor");
    expect(coverImage(row)?.width).toBe(720);
  });

  it("resposta completa substitui os campos (fotos novas incluídas) e não mexe nas outras linhas", () => {
    const other = product({ id: "p2", name: "Outra" });
    const rows = mergeUpdatedProduct([product(), other], product({ active: false, images: [] }));
    expect(rows[0].images).toEqual([]);
    expect(rows[0].active).toBe(false);
    expect(rows[1]).toBe(other);
  });
});
