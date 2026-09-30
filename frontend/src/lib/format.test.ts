import { describe, expect, it } from "vitest";
import { formatPrice, formatWeightSize } from "./format";

describe("formatPrice", () => {
  it("shows BRL for pt-BR regardless of exchange rate", () => {
    expect(formatPrice(100, "pt-BR", 5)).toBe("R$ 100,00");
  });

  it("converts BRL to USD for en when an exchange rate is given", () => {
    // 1 USD = 5 BRL -> R$100 vira $20.00
    expect(formatPrice(100, "en", 5)).toBe("$20.00");
  });

  it("falls back to BRL for en when no exchange rate is available", () => {
    expect(formatPrice(100, "en", null)).toBe("R$100.00");
    expect(formatPrice(100, "en", undefined)).toBe("R$100.00");
  });

  it("falls back to BRL for en when the exchange rate is invalid", () => {
    expect(formatPrice(100, "en", 0)).toBe("R$100.00");
    expect(formatPrice(100, "en", -5)).toBe("R$100.00");
  });
});

describe("formatWeightSize", () => {
  it("uses grams/centimeters for pt-BR, with comma as decimal separator", () => {
    expect(formatWeightSize(0.62, 1.1, "pt-BR")).toBe("0,62g · 1,1cm");
  });

  it("also uses grams/centimeters for en (métrico, sem converter para onças/polegadas), with period as decimal separator", () => {
    expect(formatWeightSize(0.62, 1.1, "en")).toBe("0.62g · 1.1cm");
  });

  it("switches to kg above 1000g in both languages", () => {
    expect(formatWeightSize(1500, 1.1, "pt-BR")).toBe("1,500kg · 1,1cm");
    expect(formatWeightSize(1500, 1.1, "en")).toBe("1.500kg · 1.1cm");
  });

  it("omits the weight or size segment when zero, in either language", () => {
    expect(formatWeightSize(0, 1.1, "en")).toBe("1.1cm");
    expect(formatWeightSize(0.62, 0, "en")).toBe("0.62g");
    expect(formatWeightSize(0, 0, "en")).toBeNull();
  });
});
