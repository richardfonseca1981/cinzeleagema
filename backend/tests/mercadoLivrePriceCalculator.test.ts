import { describe, expect, it } from "vitest";
import { calculateSuggestedPrice, type MercadoLivrePriceConfig } from "../src/lib/mercadoLivre/priceCalculator";

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
