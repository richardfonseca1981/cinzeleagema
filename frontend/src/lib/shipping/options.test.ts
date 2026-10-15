import { beforeAll, describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { cheapestOption, deliveryRangeText, optionLabel, pickBadges, selectionAfterQuote } from "./options";
import type { ShippingOption, ShippingQuoteResult } from "./types";
import { makeT } from "./testHelpers";

const opt = (id: string, priceBRL: number, min: number | null, max: number | null, kind: "quoted" | "estimated" = "quoted"): ShippingOption => ({
  id, carrier: "C", service: id, priceBRL, deliveryDaysMin: min, deliveryDaysMax: max, kind,
});

describe("pickBadges — Mais barato / Mais rápido", () => {
  it("opção única: nenhum selo", () => {
    expect(pickBadges([opt("a", 10, 3, 5)])).toEqual({ cheapestId: null, fastestId: null });
    expect(pickBadges([])).toEqual({ cheapestId: null, fastestId: null });
  });

  it("três opções: a mais barata e a de menor prazo máximo", () => {
    const options = [opt("pac", 30, 5, 8), opt("sedex", 60, 2, 3), opt("mini", 20, 8, 12)];
    expect(pickBadges(options)).toEqual({ cheapestId: "mini", fastestId: "sedex" });
  });

  it("a mesma opção pode levar os dois selos", () => {
    expect(pickBadges([opt("a", 10, 2, 3), opt("b", 20, 5, 8)])).toEqual({ cheapestId: "a", fastestId: "a" });
  });

  it("empate de preço: desempata pelo prazo (o mais rápido leva 'Mais barato')", () => {
    const options = [opt("lento", 20, 6, 9), opt("rapido", 20, 2, 3), opt("caro", 50, 1, 2)];
    expect(pickBadges(options).cheapestId).toBe("rapido");
  });

  it("empate de prazo máximo: desempata pelo preço (o mais barato leva 'Mais rápido')", () => {
    const options = [opt("caro", 50, 2, 4), opt("barato", 30, 3, 4), opt("lento", 10, 8, 10)];
    expect(pickBadges(options).fastestId).toBe("barato");
  });

  it("todos com o mesmo preço: ninguém é 'Mais barato' (selo seria artificial)", () => {
    const options = [opt("a", 25, 5, 8), opt("b", 25, 2, 3)];
    expect(pickBadges(options)).toEqual({ cheapestId: null, fastestId: "b" });
  });

  it("todos com o mesmo prazo: ninguém é 'Mais rápido'", () => {
    const options = [opt("a", 10, 5, 8), opt("b", 20, 5, 8)];
    expect(pickBadges(options)).toEqual({ cheapestId: "a", fastestId: null });
  });

  it("empate total (mesmo preço e mesmo prazo): nenhum selo", () => {
    expect(pickBadges([opt("a", 10, 3, 5), opt("b", 10, 3, 5)])).toEqual({ cheapestId: null, fastestId: null });
  });

  it("prazos nulos nunca ganham 'Mais rápido'", () => {
    const options = [opt("sem", 5, null, null), opt("com", 40, 4, 6), opt("outro", 30, 7, 9)];
    expect(pickBadges(options)).toEqual({ cheapestId: "sem", fastestId: "com" });
  });

  it("todos os prazos nulos: sem 'Mais rápido'", () => {
    expect(pickBadges([opt("a", 10, null, null), opt("b", 20, null, null)])).toEqual({ cheapestId: "a", fastestId: null });
  });

  it("só um prazo conhecido entre nulos: sem 'Mais rápido' (não há como comparar)", () => {
    expect(pickBadges([opt("a", 10, 3, 5), opt("b", 20, null, null)]).fastestId).toBeNull();
  });

  it("se só um dos limites do prazo veio, ele vale para os dois", () => {
    const options = [opt("a", 30, null, 4), opt("b", 30, 9, null)];
    expect(pickBadges(options).fastestId).toBe("a");
  });
});

describe("cheapestOption (pré-seleção)", () => {
  it("escolhe a mais barata, com desempate pelo prazo e depois pela ordem original", () => {
    expect(cheapestOption([opt("a", 30, 5, 8), opt("b", 20, 6, 9)])!.id).toBe("b");
    expect(cheapestOption([opt("lento", 20, 6, 9), opt("rapido", 20, 2, 3)])!.id).toBe("rapido");
    expect(cheapestOption([opt("primeira", 20, 3, 5), opt("segunda", 20, 3, 5)])!.id).toBe("primeira");
  });

  it("lista vazia: null", () => {
    expect(cheapestOption([])).toBeNull();
  });
});

describe("selectionAfterQuote", () => {
  const ok = (options: ShippingOption[]): ShippingQuoteResult => ({
    destination: { country: "BR", postalCode: "01001000", city: null, state: null },
    mode: "domestic", options, requiresConfirmation: false, notice: null, unavailable: null,
  });
  const unavailable = (mode: "domestic" | "international"): ShippingQuoteResult => ({
    ...ok([]), mode, unavailable: { reason: "not_configured" },
  });

  it("pré-seleciona a mais barata", () => {
    expect(selectionAfterQuote(ok([opt("a", 30, 5, 8), opt("b", 20, 6, 9)]), null)).toBe("b");
  });

  it("mantém a escolha anterior se ela ainda existe (recálculo depois de mudar o carrinho)", () => {
    expect(selectionAfterQuote(ok([opt("a", 30, 5, 8), opt("b", 20, 6, 9)]), "a")).toBe("a");
  });

  it("escolha anterior que sumiu volta para a mais barata", () => {
    expect(selectionAfterQuote(ok([opt("b", 20, 6, 9)]), "x")).toBe("b");
  });

  it("indisponível (inclusive país sem tarifa): nada selecionado — 'a combinar' não é uma opção", () => {
    expect(selectionAfterQuote(unavailable("domestic"), "a")).toBeNull();
    expect(selectionAfterQuote(unavailable("international"), null)).toBeNull();
  });
});

describe("optionLabel", () => {
  it("Brasil: transportadora e serviço", () => {
    expect(optionLabel({ carrier: "Correios", service: "PAC" })).toBe("Correios — PAC");
  });

  it("exterior (carrier = service): mostra o nome uma vez só", () => {
    expect(optionLabel({ carrier: "DHL Express", service: "DHL Express" })).toBe("DHL Express");
    expect(optionLabel({ carrier: "", service: "Aéreo" })).toBe("Aéreo");
  });
});

describe("deliveryRangeText — formatação do prazo", () => {
  let pt: TFunction;
  let en: TFunction;
  beforeAll(async () => {
    pt = await makeT("pt-BR");
    en = await makeT("en");
  });

  it("intervalo", () => {
    expect(deliveryRangeText(pt, 5, 8)).toBe("5 a 8 dias");
    expect(deliveryRangeText(en, 5, 8)).toBe("5 to 8 days");
  });

  it("prazo único, no singular e no plural", () => {
    expect(deliveryRangeText(pt, 5, 5)).toBe("5 dias");
    expect(deliveryRangeText(pt, 1, 1)).toBe("1 dia");
    expect(deliveryRangeText(en, 1, 1)).toBe("1 day");
    expect(deliveryRangeText(en, 3, 3)).toBe("3 days");
  });

  it("só um dos limites: vira prazo único", () => {
    expect(deliveryRangeText(pt, null, 6)).toBe("6 dias");
    expect(deliveryRangeText(pt, 4, null)).toBe("4 dias");
  });

  it("limites invertidos são corrigidos", () => {
    expect(deliveryRangeText(pt, 8, 5)).toBe("5 a 8 dias");
  });

  it("sem prazo: null", () => {
    expect(deliveryRangeText(pt, null, null)).toBeNull();
  });

  it("nunca afirma 'dias úteis' (unidade não confirmada na documentação do provedor)", () => {
    expect(deliveryRangeText(pt, 5, 8)).not.toMatch(/úteis/i);
    expect(deliveryRangeText(pt, 1, 1)).not.toMatch(/úteis/i);
  });
});
