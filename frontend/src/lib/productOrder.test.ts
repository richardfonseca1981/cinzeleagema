import { describe, expect, it } from "vitest";
import { moveItem, moveToBottom, moveToTop, sameOrder } from "./productOrder";

describe("productOrder", () => {
  const l = ["a", "b", "c", "d"];
  it("move para cima/baixo", () => {
    expect(moveItem(l, 2, 1)).toEqual(["a", "c", "b", "d"]);
    expect(moveItem(l, 1, 2)).toEqual(["a", "c", "b", "d"]);
  });
  it("topo e fim", () => {
    expect(moveToTop(l, 3)).toEqual(["d", "a", "b", "c"]);
    expect(moveToBottom(l, 0)).toEqual(["b", "c", "d", "a"]);
  });
  it("limites e índices inválidos não alteram", () => {
    expect(moveItem(l, 0, -5)).toEqual(l);
    expect(moveItem(l, 9, 0)).toBe(l);
    expect(moveItem(l, 3, 99)).toEqual(l);
  });
  it("não muta o original", () => {
    moveItem(l, 0, 3);
    expect(l).toEqual(["a", "b", "c", "d"]);
  });
  it("sameOrder", () => {
    expect(sameOrder(l, [...l])).toBe(true);
    expect(sameOrder(l, ["b", "a", "c", "d"])).toBe(false);
  });
});
