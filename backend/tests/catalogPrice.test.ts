import { describe, expect, it } from "vitest";
import { formatPriceEnParts, formatPricePtParts, formatPriceParts } from "../src/lib/catalog/price";

describe("formatPricePtParts", () => {
  it("formata inteiro simples", () => {
    expect(formatPricePtParts(100)).toEqual({ symbol: "R$", integer: "100", decimals: "00", decimalSeparator: "," });
  });

  it("formata milhar com ponto", () => {
    expect(formatPricePtParts(8500)).toEqual({ symbol: "R$", integer: "8.500", decimals: "00", decimalSeparator: "," });
  });

  it("formata centavos reais (não arredonda para 00)", () => {
    expect(formatPricePtParts(1234.56)).toEqual({ symbol: "R$", integer: "1.234", decimals: "56", decimalSeparator: "," });
  });

  it("formata zero (preço promocional/simbólico, diferente de null)", () => {
    expect(formatPricePtParts(0)).toEqual({ symbol: "R$", integer: "0", decimals: "00", decimalSeparator: "," });
  });

  it("formata milhões com dois separadores de milhar", () => {
    expect(formatPricePtParts(1234567.89)).toEqual({
      symbol: "R$",
      integer: "1.234.567",
      decimals: "89",
      decimalSeparator: ",",
    });
  });
});

describe("formatPriceEnParts", () => {
  it("converte para USD pela cotação do dia", () => {
    // 530 BRL / 5.3 = 100 USD
    expect(formatPriceEnParts(530, 5.3)).toEqual({ symbol: "$", integer: "100", decimals: "00", decimalSeparator: "." });
  });

  it("formata milhar em USD com vírgula", () => {
    // 13250 BRL / 5.3 = 2500 USD
    expect(formatPriceEnParts(13250, 5.3)).toEqual({ symbol: "$", integer: "2,500", decimals: "00", decimalSeparator: "." });
  });

  it("sem cotação disponível, cai de volta para BRL (mesma regra do site público)", () => {
    expect(formatPriceEnParts(8500, null)).toEqual({ symbol: "R$", integer: "8.500", decimals: "00", decimalSeparator: "," });
  });

  it("cotação zero ou negativa também cai para BRL", () => {
    expect(formatPriceEnParts(100, 0)).toEqual({ symbol: "R$", integer: "100", decimals: "00", decimalSeparator: "," });
    expect(formatPriceEnParts(100, -5)).toEqual({ symbol: "R$", integer: "100", decimals: "00", decimalSeparator: "," });
  });
});

describe("formatPriceParts", () => {
  it("escolhe PT ou EN pelo idioma", () => {
    expect(formatPriceParts(530, "pt", 5.3)).toEqual({ symbol: "R$", integer: "530", decimals: "00", decimalSeparator: "," });
    expect(formatPriceParts(530, "en", 5.3)).toEqual({ symbol: "$", integer: "100", decimals: "00", decimalSeparator: "." });
  });
});
