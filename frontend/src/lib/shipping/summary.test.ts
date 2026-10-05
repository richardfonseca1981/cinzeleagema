import { describe, expect, it } from "vitest";
import { QUOTE_MAX_AGE_MS, type StoredShipping } from "./storage";
import { destinationFor, resolveShippingSummary, shippingAmountBRL } from "./summary";
import { ARRANGE_OPTION_ID, type ShippingOption, type ShippingQuoteResult } from "./types";

const NOW = 1_800_000_000_000;
const pac: ShippingOption = { id: "pac", carrier: "Correios", service: "PAC", priceBRL: 30, deliveryDaysMin: 5, deliveryDaysMax: 8, kind: "quoted" };
const estimated: ShippingOption = { id: "est", carrier: "Tabela", service: "Aéreo", priceBRL: 210, deliveryDaysMin: 7, deliveryDaysMax: 15, kind: "estimated" };

const result = (options: ShippingOption[], over: Partial<ShippingQuoteResult> = {}): ShippingQuoteResult => ({
  destination: { country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP" },
  mode: "domestic", options, requiresConfirmation: false, notice: null, unavailable: null, ...over,
});
const stored = (over: Partial<StoredShipping> = {}): StoredShipping => ({
  version: 1, country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP",
  quote: { result: result([pac, estimated]), signature: "a:1", savedAt: NOW }, selection: "pac", ...over,
});

describe("resolveShippingSummary", () => {
  it("sem estado ou sem escolha: 'none' (o pedido segue, frete a combinar)", () => {
    expect(resolveShippingSummary(null, "a:1", NOW)).toEqual({ kind: "none" });
    expect(resolveShippingSummary(stored({ selection: null }), "a:1", NOW)).toEqual({ kind: "none" });
  });

  it("opção cotada válida", () => {
    const s = resolveShippingSummary(stored(), "a:1", NOW + 1000);
    expect(s).toMatchObject({ kind: "quoted", option: { id: "pac" }, international: false, taxesNotIncluded: false });
    expect(shippingAmountBRL(s)).toBe(30);
  });

  it("opção estimada", () => {
    const s = resolveShippingSummary(stored({ selection: "est" }), "a:1", NOW + 1000);
    expect(s).toMatchObject({ kind: "estimated", option: { id: "est" } });
    expect(shippingAmountBRL(s)).toBe(210);
  });

  it("'a combinar' vale sempre, independente do carrinho e do tempo", () => {
    const s = resolveShippingSummary(stored({ selection: ARRANGE_OPTION_ID }), "mudou:9", NOW + 10 * QUOTE_MAX_AGE_MS);
    expect(s).toEqual({ kind: "arrange", international: false });
    expect(shippingAmountBRL(s)).toBeNull();
  });

  it("carrinho mudou depois da cotação: 'stale' (sem preço, sem bloquear)", () => {
    const s = resolveShippingSummary(stored(), "a:2", NOW + 1000);
    expect(s).toEqual({ kind: "stale", international: false });
    expect(shippingAmountBRL(s)).toBeNull();
  });

  it("passou de 30 minutos: 'stale'", () => {
    expect(resolveShippingSummary(stored(), "a:1", NOW + QUOTE_MAX_AGE_MS).kind).toBe("stale");
  });

  it("escolha que não existe mais na cotação: 'none'", () => {
    expect(resolveShippingSummary(stored({ selection: "sumiu" }), "a:1", NOW).kind).toBe("none");
  });

  it("destino internacional marca 'international' e impostos não incluídos", () => {
    const intl = stored({
      country: "US",
      quote: { result: result([estimated], { mode: "international", notice: "taxes_not_included", requiresConfirmation: true }), signature: "a:1", savedAt: NOW },
      selection: "est",
    });
    expect(resolveShippingSummary(intl, "a:1", NOW)).toMatchObject({ kind: "estimated", international: true, taxesNotIncluded: true });
    expect(resolveShippingSummary(stored({ country: "PT", selection: ARRANGE_OPTION_ID }), "a:1", NOW)).toEqual({ kind: "arrange", international: true });
  });
});

describe("destinationFor", () => {
  it("sem escolha do comprador, sem destino na mensagem", () => {
    expect(destinationFor(stored({ selection: null }), { kind: "none" })).toBeNull();
    expect(destinationFor(null, { kind: "none" })).toBeNull();
  });

  it("com escolha: país, CEP e cidade/UF", () => {
    const s = stored();
    expect(destinationFor(s, resolveShippingSummary(s, "a:1", NOW))).toEqual({ country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP" });
  });

  it("nunca usa a cidade de uma cotação de OUTRO país", () => {
    const s = stored({ country: "PT", postalCode: "", city: null, state: null, selection: ARRANGE_OPTION_ID });
    expect(destinationFor(s, resolveShippingSummary(s, "a:1", NOW))).toEqual({ country: "PT", postalCode: "", city: null, state: null });
  });

  it("usa a cidade da cotação se o nome do CEP não foi guardado", () => {
    const s = stored({ city: null, state: null });
    expect(destinationFor(s, resolveShippingSummary(s, "a:1", NOW))).toMatchObject({ city: "São Paulo", state: "SP" });
  });
});
