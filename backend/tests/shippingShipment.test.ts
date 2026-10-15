import { describe, expect, it } from "vitest";
import { BOX_FILL_FACTOR, computeShipment, getShipmentConfig, type ShipmentConfig } from "../src/lib/shipping/shipment";

const config: ShipmentConfig = { box: { lengthCm: 40, widthCm: 30, heightCm: 25 }, packagingWeightG: 300 };
const item = (overrides = {}) => ({ weightGrams: 80, sizeCm: 3, quantity: 1, unitPriceBRL: 100, ...overrides });

describe("computeShipment", () => {
  it("usa sempre a caixa fixa, soma peso (embalagem uma vez) e seguro", () => {
    const result = computeShipment([item({ quantity: 2, unitPriceBRL: 50.5 }), item({ weightGrams: 120, unitPriceBRL: 10 })], config);
    expect(result).toEqual({
      ok: true,
      shipment: { box: { lengthCm: 40, widthCm: 30, heightCm: 25 }, weightGrams: 80 * 2 + 120 + 300, insuranceValueBRL: 111 },
    });
  });

  it("peça com sizeCm 25 cabe (volume 15625 <= 18000)", () => {
    expect(computeShipment([item({ sizeCm: 25 })], config).ok).toBe(true);
  });

  it("peça com sizeCm 26 é over_limits", () => {
    expect(computeShipment([item({ sizeCm: 26 })], config)).toEqual({ ok: false, reason: "over_limits" });
  });

  it("volume exatamente no limite passa e acima dele é over_limits", () => {
    const limit = 40 * 30 * 25 * BOX_FILL_FACTOR; // 18000
    expect(computeShipment([item({ sizeCm: 10, quantity: 18 })], config).ok).toBe(true); // 18 x 1000 = 18000
    expect(computeShipment([item({ sizeCm: 10, quantity: 19 })], config)).toEqual({ ok: false, reason: "over_limits" });
    expect(limit).toBe(18000);
  });

  it("quantidade alta de peças pequenas estoura o volume", () => {
    expect(computeShipment([item({ sizeCm: 3, quantity: 99 })], config).ok).toBe(true); // 2673 cm³
    expect(computeShipment([item({ sizeCm: 6, quantity: 99 })], config)).toEqual({ ok: false, reason: "over_limits" }); // 21384
  });

  it("peso ou tamanho zerados são incomplete_product_data", () => {
    expect(computeShipment([item({ weightGrams: 0 })], config)).toEqual({ ok: false, reason: "incomplete_product_data" });
    expect(computeShipment([item({ sizeCm: 0 })], config)).toEqual({ ok: false, reason: "incomplete_product_data" });
  });

  it("respeita a caixa e a embalagem sobrescritas por configuração", () => {
    const custom = getShipmentConfig({
      SHIPPING_BOX_LENGTH_CM: 20,
      SHIPPING_BOX_WIDTH_CM: 20,
      SHIPPING_BOX_HEIGHT_CM: 10,
      SHIPPING_PACKAGING_WEIGHT_G: 500,
    });
    expect(computeShipment([item({ sizeCm: 11 })], custom)).toEqual({ ok: false, reason: "over_limits" });
    const ok = computeShipment([item()], custom);
    expect(ok).toMatchObject({ ok: true, shipment: { box: { lengthCm: 20, widthCm: 20, heightCm: 10 }, weightGrams: 580 } });
  });
});
