import { describe, expect, it } from "vitest";
import { clampIndex, galleryItemsFromImages, indexFromScroll, showsControls } from "./gallery";

describe("galleryItemsFromImages", () => {
  it("segue a ordem definida no admin (position) e marca todos como imagem", () => {
    const items = galleryItemsFromImages([
      { id: "b", url: "u2", key: "k", position: 1 },
      { id: "a", url: "u1", key: "k", position: 0 },
    ]);
    expect(items).toEqual([
      { type: "image", id: "a", url: "u1" },
      { type: "image", id: "b", url: "u2" },
    ]);
  });
});

describe("navegação", () => {
  it("clampIndex para nas pontas", () => {
    expect(clampIndex(-1, 5)).toBe(0);
    expect(clampIndex(5, 5)).toBe(4);
    expect(clampIndex(2, 5)).toBe(2);
    expect(clampIndex(3, 0)).toBe(0);
  });
  it("indexFromScroll arredonda para o slide mais próximo", () => {
    expect(indexFromScroll(0, 360, 5)).toBe(0);
    expect(indexFromScroll(190, 360, 5)).toBe(1);
    expect(indexFromScroll(99999, 360, 5)).toBe(4);
    expect(indexFromScroll(10, 0, 5)).toBe(0);
  });
  it("1 foto: sem pontos, contador nem miniaturas", () => {
    expect(showsControls(1)).toBe(false);
    expect(showsControls(0)).toBe(false);
    expect(showsControls(2)).toBe(true);
  });
});
