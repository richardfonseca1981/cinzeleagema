import { describe, expect, it } from "vitest";
import { cartSignature } from "./cartSignature";

describe("cartSignature", () => {
  it("lista ids e quantidades", () => {
    expect(cartSignature([{ productId: "b", quantity: 2 }, { productId: "a", quantity: 1 }])).toBe("a:1|b:2");
  });

  it("não depende da ordem dos itens", () => {
    const a = cartSignature([{ productId: "x", quantity: 1 }, { productId: "y", quantity: 3 }]);
    const b = cartSignature([{ productId: "y", quantity: 3 }, { productId: "x", quantity: 1 }]);
    expect(a).toBe(b);
  });

  it("muda quando muda uma quantidade, um item entra ou sai", () => {
    const base = cartSignature([{ productId: "x", quantity: 1 }]);
    expect(cartSignature([{ productId: "x", quantity: 2 }])).not.toBe(base);
    expect(cartSignature([{ productId: "x", quantity: 1 }, { productId: "y", quantity: 1 }])).not.toBe(base);
    expect(cartSignature([])).not.toBe(base);
  });

  it("não confunde 'a:1|b:1' com um id que contém dois-pontos", () => {
    expect(cartSignature([{ productId: "a", quantity: 11 }])).not.toBe(cartSignature([{ productId: "a:1", quantity: 1 }]));
  });
});
