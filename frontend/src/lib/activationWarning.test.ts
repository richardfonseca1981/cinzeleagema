import { describe, expect, it } from "vitest";
import { isMissingKeyFields, shouldWarnOnActivate } from "./activationWarning";

describe("isMissingKeyFields", () => {
  it("true quando falta nome, preço ou foto", () => {
    expect(isMissingKeyFields({ name: null, price: "10", hasPhoto: true })).toBe(true);
    expect(isMissingKeyFields({ name: "  ", price: "10", hasPhoto: true })).toBe(true);
    expect(isMissingKeyFields({ name: "Ametista", price: null, hasPhoto: true })).toBe(true);
    expect(isMissingKeyFields({ name: "Ametista", price: "10", hasPhoto: false })).toBe(true);
  });

  it("false quando nome, preço e foto estão presentes (preço 0 é um preço válido)", () => {
    expect(isMissingKeyFields({ name: "Ametista", price: "10", hasPhoto: true })).toBe(false);
    expect(isMissingKeyFields({ name: "Ametista", price: "0", hasPhoto: true })).toBe(false);
  });
});

describe("shouldWarnOnActivate", () => {
  it("nunca avisa para peça inativa, mesmo incompleta", () => {
    expect(shouldWarnOnActivate(false, { name: null, price: null, hasPhoto: false })).toBe(false);
  });

  it("avisa só quando a peça vai ficar/estar ativa E incompleta", () => {
    expect(shouldWarnOnActivate(true, { name: null, price: null, hasPhoto: false })).toBe(true);
    expect(shouldWarnOnActivate(true, { name: "Ametista", price: "10", hasPhoto: true })).toBe(false);
  });
});
