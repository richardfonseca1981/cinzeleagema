import { describe, expect, it } from "vitest";
import { QUOTE_CACHE_TTL_MS, type StoredShipping } from "./storage";
import { destinationFor, resolveShippingSummary, sameShipping, shippingAmountBRL } from "./summary";
import type { ShippingOption, ShippingQuoteResult, ShippingUnavailableReason } from "./types";

const NOW = 1_800_000_000_000;
const pac: ShippingOption = { id: "pac", carrier: "Correios", service: "PAC", priceBRL: 30, deliveryDaysMin: 5, deliveryDaysMax: 8, kind: "quoted" };
const sedex: ShippingOption = { id: "sedex", carrier: "Correios", service: "SEDEX", priceBRL: 50, deliveryDaysMin: 1, deliveryDaysMax: 2, kind: "quoted" };
const dhl: ShippingOption = { id: "intl-1", carrier: "DHL", service: "DHL", priceBRL: 210, deliveryDaysMin: 7, deliveryDaysMax: 15, kind: "quoted" };

const result = (options: ShippingOption[], over: Partial<ShippingQuoteResult> = {}): ShippingQuoteResult => ({
  destination: { country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP" },
  mode: "domestic", options, requiresConfirmation: false, notice: null, unavailable: null, ...over,
});
const unavailable = (reason: ShippingUnavailableReason, over: Partial<ShippingQuoteResult> = {}) =>
  result([], { unavailable: { reason }, ...over });

const stored = (over: Partial<StoredShipping> = {}): StoredShipping => ({
  version: 2, country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP",
  quote: { result: result([pac, sedex]), signature: "a:1", savedAt: NOW }, selection: "pac", arrangeChoice: null, ...over,
});
const withQuote = (r: ShippingQuoteResult, over: Partial<StoredShipping> = {}) =>
  stored({ quote: { result: r, signature: "a:1", savedAt: NOW }, selection: null, ...over });

describe("resolveShippingSummary — frete definitivo", () => {
  it("sem estado, sem cotação ou sem escolha: 'none' (não há frete utilizável)", () => {
    expect(resolveShippingSummary(null, "a:1", NOW)).toEqual({ kind: "none" });
    expect(resolveShippingSummary(stored({ quote: null, selection: null }), "a:1", NOW)).toEqual({ kind: "none" });
    expect(resolveShippingSummary(stored({ selection: null }), "a:1", NOW)).toEqual({ kind: "none" });
  });

  it("opção cotada válida (Brasil): valor definitivo, sem 'estimated'", () => {
    const s = resolveShippingSummary(stored(), "a:1", NOW + 1000);
    expect(s).toMatchObject({ kind: "quoted", option: { id: "pac" }, international: false, taxesNotIncluded: false, fresh: true });
    expect(shippingAmountBRL(s)).toBe(30);
  });

  it("exterior cotado: definitivo, com impostos de importação não incluídos", () => {
    const s = resolveShippingSummary(
      stored({ country: "US", quote: { result: result([dhl], { mode: "international", notice: "taxes_not_included" }), signature: "a:1", savedAt: NOW }, selection: "intl-1" }),
      "a:1",
      NOW
    );
    expect(s).toMatchObject({ kind: "quoted", international: true, taxesNotIncluded: true, fresh: true });
    expect(shippingAmountBRL(s)).toBe(210);
  });

  it("a cotação vale por 10 minutos: com exatos 10 min já não é 'fresh' (o valor é recalculado ao confirmar)", () => {
    expect(resolveShippingSummary(stored(), "a:1", NOW + QUOTE_CACHE_TTL_MS - 1)).toMatchObject({ kind: "quoted", fresh: true });
    expect(resolveShippingSummary(stored(), "a:1", NOW + QUOTE_CACHE_TTL_MS)).toMatchObject({ kind: "quoted", fresh: false });
    expect(resolveShippingSummary(stored(), "a:1", NOW + 30 * 60 * 1000)).toMatchObject({ kind: "quoted", fresh: false });
  });

  it("carrinho mudou depois da cotação: 'none' — o preço antigo nunca é mostrado nem usado", () => {
    const s = resolveShippingSummary(stored(), "a:2", NOW + 1000);
    expect(s).toEqual({ kind: "none" });
    expect(shippingAmountBRL(s)).toBeNull();
  });

  it("escolha que não existe mais na cotação: 'none'", () => {
    expect(resolveShippingSummary(stored({ selection: "sumiu" }), "a:1", NOW).kind).toBe("none");
  });

  it.each(["over_limits", "no_rates_configured", "incomplete_product_data"] as const)(
    "%s: 'a combinar' automático, sem preço",
    (reason) => {
      const s = resolveShippingSummary(withQuote(unavailable(reason)), "a:1", NOW + 1000);
      expect(s).toEqual({ kind: "arrange", reason, international: false, fresh: true });
      expect(shippingAmountBRL(s)).toBeNull();
    }
  );

  it("país sem tarifa no exterior: 'a combinar' internacional", () => {
    const s = resolveShippingSummary(
      withQuote(unavailable("no_rates_configured", { mode: "international", notice: "taxes_not_included" }), { country: "PT" }),
      "a:1",
      NOW
    );
    expect(s).toEqual({ kind: "arrange", reason: "no_rates_configured", international: true, fresh: true });
  });

  it("'a combinar' automático também vence em 10 minutos (recalculado ao confirmar)", () => {
    expect(resolveShippingSummary(withQuote(unavailable("over_limits")), "a:1", NOW + QUOTE_CACHE_TTL_MS)).toMatchObject({ kind: "arrange", fresh: false });
  });

  it.each(["provider_error", "not_configured", "invalid_destination"] as const)(
    "%s NUNCA vira 'a combinar' sozinho: 'none'",
    (reason) => {
      expect(resolveShippingSummary(withQuote(unavailable(reason)), "a:1", NOW).kind).toBe("none");
    }
  );

  it("escolha explícita de 'a combinar' depois de falha técnica: vale para o mesmo carrinho", () => {
    const s = resolveShippingSummary(
      stored({ quote: null, selection: null, arrangeChoice: { signature: "a:1", cause: "timeout", chosenAt: NOW } }),
      "a:1",
      NOW + 60 * 60 * 1000
    );
    expect(s).toEqual({ kind: "arrange", reason: "technical_choice", international: false, fresh: true });
  });

  it("a escolha de 'a combinar' NÃO vale se o carrinho mudou", () => {
    const s = resolveShippingSummary(
      stored({ quote: null, selection: null, arrangeChoice: { signature: "a:1", cause: "timeout", chosenAt: NOW } }),
      "a:2",
      NOW
    );
    expect(s).toEqual({ kind: "none" });
  });
});

describe("sameShipping — o que o comprador estava vendo é o que vale?", () => {
  const quoted = (option: ShippingOption) => resolveShippingSummary(stored({ selection: option.id }), "a:1", NOW);

  it("mesma opção e mesmo valor", () => {
    expect(sameShipping(quoted(pac), quoted(pac))).toBe(true);
  });

  it("valor diferente, ou outra opção, ou 'none' contra algo: diferente", () => {
    expect(sameShipping(quoted(pac), resolveShippingSummary(stored({ quote: { result: result([{ ...pac, priceBRL: 31 }]), signature: "a:1", savedAt: NOW } }), "a:1", NOW))).toBe(false);
    expect(sameShipping(quoted(pac), quoted(sedex))).toBe(false);
    expect(sameShipping({ kind: "none" }, quoted(pac))).toBe(false);
    expect(sameShipping({ kind: "none" }, { kind: "none" })).toBe(false);
  });

  it("'a combinar': mesmo motivo é igual; motivo diferente ou cotado contra a combinar é diferente", () => {
    const a = { kind: "arrange", reason: "over_limits", international: false, fresh: true } as const;
    expect(sameShipping(a, { ...a, fresh: false })).toBe(true);
    expect(sameShipping(a, { ...a, reason: "no_rates_configured" })).toBe(false);
    expect(sameShipping(a, quoted(pac))).toBe(false);
  });
});

describe("destinationFor", () => {
  it("sem frete utilizável, sem destino na mensagem", () => {
    expect(destinationFor(stored({ selection: null }), { kind: "none" })).toBeNull();
    expect(destinationFor(null, { kind: "none" })).toBeNull();
  });

  it("com frete: país, CEP e cidade/UF", () => {
    const s = stored();
    expect(destinationFor(s, resolveShippingSummary(s, "a:1", NOW))).toEqual({ country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP" });
  });

  it("nunca usa a cidade de uma cotação de OUTRO país", () => {
    const s = withQuote(unavailable("no_rates_configured", { mode: "international" }), { country: "PT", postalCode: "", city: null, state: null });
    expect(destinationFor(s, resolveShippingSummary(s, "a:1", NOW))).toEqual({ country: "PT", postalCode: "", city: null, state: null });
  });

  it("usa a cidade da cotação se o nome do CEP não foi guardado", () => {
    const s = stored({ city: null, state: null });
    expect(destinationFor(s, resolveShippingSummary(s, "a:1", NOW))).toMatchObject({ city: "São Paulo", state: "SP" });
  });
});
