import { describe, expect, it } from "vitest";
import {
  calculateSuggestedPrice,
  calculateMinimumMarkupForBreakeven,
  type MercadoLivrePriceConfig,
} from "../src/lib/mercadoLivre/priceCalculator";

const config: MercadoLivrePriceConfig = { markupPct: 10, commissionPct: 12.5, fixedFeeBRL: 6, shippingCostBRL: 20 };

describe("calculateSuggestedPrice", () => {
  it("aplica markup sobre o preço base", () => {
    const result = calculateSuggestedPrice(1000, config);
    expect(result.markupAmount).toBeCloseTo(100, 5);
    expect(result.listingPrice).toBeCloseTo(1100, 5);
  });

  it("calcula comissão sobre o preço de anúncio (já com markup), não sobre o preço base", () => {
    const result = calculateSuggestedPrice(1000, config);
    expect(result.commissionAmount).toBeCloseTo(1100 * 0.125, 5);
  });

  it("subtrai comissão, tarifa fixa e frete do preço de anúncio para chegar no líquido", () => {
    const result = calculateSuggestedPrice(1000, config);
    const expectedNet = 1100 - 1100 * 0.125 - 6 - 20;
    expect(result.netReceived).toBeCloseTo(expectedNet, 5);
  });

  it("markup 0 mantém o preço de anúncio igual ao preço base", () => {
    const result = calculateSuggestedPrice(500, { ...config, markupPct: 0 });
    expect(result.listingPrice).toBeCloseTo(500, 5);
  });

  it("rejeita preço base zero ou negativo", () => {
    expect(() => calculateSuggestedPrice(0, config)).toThrow();
    expect(() => calculateSuggestedPrice(-10, config)).toThrow();
  });
});

describe("calculateMinimumMarkupForBreakeven", () => {
  const fees = { commissionPct: 12.5, fixedFeeBRL: 6, shippingCostBRL: 0 };

  it("o markup devolvido, aplicado de volta em calculateSuggestedPrice, dá líquido = preço base (ponto de equilíbrio)", () => {
    const basePrice = 100;
    const minMarkup = calculateMinimumMarkupForBreakeven(basePrice, fees);
    const result = calculateSuggestedPrice(basePrice, { ...fees, markupPct: minMarkup });
    expect(result.netReceived).toBeCloseTo(basePrice, 5);
  });

  it("markup menor que o mínimo dá líquido abaixo do preço base; maior dá líquido acima", () => {
    const basePrice = 200;
    const minMarkup = calculateMinimumMarkupForBreakeven(basePrice, fees);

    const below = calculateSuggestedPrice(basePrice, { ...fees, markupPct: minMarkup - 5 });
    expect(below.netReceived).toBeLessThan(basePrice);

    const above = calculateSuggestedPrice(basePrice, { ...fees, markupPct: minMarkup + 5 });
    expect(above.netReceived).toBeGreaterThan(basePrice);
  });

  it("frete/tarifa fixa maiores exigem markup mínimo maior", () => {
    const basePrice = 150;
    const low = calculateMinimumMarkupForBreakeven(basePrice, { commissionPct: 12.5, fixedFeeBRL: 6, shippingCostBRL: 0 });
    const high = calculateMinimumMarkupForBreakeven(basePrice, { commissionPct: 12.5, fixedFeeBRL: 6, shippingCostBRL: 40 });
    expect(high).toBeGreaterThan(low);
  });

  it("comissão >= 100%: nenhum markup finito cobre o preço base — devolve Infinity, nunca lança", () => {
    expect(calculateMinimumMarkupForBreakeven(100, { commissionPct: 100, fixedFeeBRL: 0, shippingCostBRL: 0 })).toBe(Infinity);
    expect(calculateMinimumMarkupForBreakeven(100, { commissionPct: 150, fixedFeeBRL: 0, shippingCostBRL: 0 })).toBe(Infinity);
  });

  it("rejeita preço base zero ou negativo", () => {
    expect(() => calculateMinimumMarkupForBreakeven(0, fees)).toThrow();
    expect(() => calculateMinimumMarkupForBreakeven(-10, fees)).toThrow();
  });
});
