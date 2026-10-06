import { describe, expect, it } from "vitest";
import { listCountries } from "./shipping/countries";
import {
  emptyRateDraft,
  filterCountries,
  formatDays,
  formatKg,
  parsePrice,
  sortSelected,
  validateRateDraft,
  type RateDraft,
} from "./shippingAdmin";

const draft = (over: Partial<RateDraft> = {}): RateDraft => ({ ...emptyRateDraft(), serviceName: "DHL", maxWeightG: "1000", priceBRL: "120,50", ...over });

describe("formatKg", () => {
  it.each([
    [1000, "1 kg"],
    [1500, "1,5 kg"],
    [380, "0,38 kg"],
    [30000, "30 kg"],
    [1, "0,001 kg"],
    [2345, "2,345 kg"],
  ])("%d g → %s", (grams, text) => expect(formatKg(grams).replace(/ /g, " ")).toBe(text));
});

describe("parsePrice", () => {
  it.each([
    ["120,50", 120.5],
    ["120.50", 120.5],
    ["1.234,56", 1234.56],
    ["0", 0],
    ["10", 10],
    [" 7,5 ", 7.5],
  ])("aceita %s", (input, value) => expect(parsePrice(input)).toBe(value));

  it.each(["", "abc", "10,123", "-5", "1,2,3", "R$ 10", "100000000"])("rejeita %j", (input) => expect(parsePrice(input)).toBeNull());
});

describe("validateRateDraft", () => {
  it("rascunho válido vira o payload da API", () => {
    expect(validateRateDraft(draft({ deliveryDaysMin: "5", deliveryDaysMax: "8" }))).toEqual({
      ok: true,
      payload: { serviceName: "DHL", maxWeightG: 1000, priceBRL: 120.5, deliveryDaysMin: 5, deliveryDaysMax: 8, active: true },
    });
  });

  it("prazos são opcionais", () => {
    expect(validateRateDraft(draft())).toMatchObject({ ok: true, payload: { deliveryDaysMin: null, deliveryDaysMax: null } });
    expect(validateRateDraft(draft({ deliveryDaysMax: "9" }))).toMatchObject({ ok: true, payload: { deliveryDaysMin: null, deliveryDaysMax: 9 } });
  });

  it.each([
    [{ serviceName: "  " }, "Informe o nome do serviço"],
    [{ maxWeightG: "" }, "até quantos gramas"],
    [{ maxWeightG: "0" }, "até quantos gramas"],
    [{ maxWeightG: "10,5" }, "até quantos gramas"],
    [{ maxWeightG: "2000000" }, "não pode passar de"],
    [{ priceBRL: "" }, "Informe o preço"],
    [{ priceBRL: "10,123" }, "Informe o preço"],
    [{ deliveryDaysMin: "x" }, "prazo mínimo deve ser"],
    [{ deliveryDaysMax: "2,5" }, "prazo máximo deve ser"],
    [{ deliveryDaysMin: "9", deliveryDaysMax: "3" }, "O prazo mínimo não pode ser maior"],
  ])("rejeita %j", (over, message) => {
    const result = validateRateDraft(draft(over));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });
});

describe("busca de países", () => {
  const options = listCountries("pt-BR").filter((o) => o.code !== "BR");

  it("a lista do admin tem nomes em português e nunca o Brasil", () => {
    expect(options.find((o) => o.code === "US")?.name).toBe("Estados Unidos");
    expect(options.find((o) => o.code === "BR")).toBeUndefined();
  });

  it("acha por nome sem acento e sem maiúsculas, e por código", () => {
    expect(filterCountries(options, "estados unidos").map((o) => o.code)).toContain("US");
    expect(filterCountries(options, "ALEMANHA").map((o) => o.code)).toEqual(["DE"]);
    expect(filterCountries(options, "japao").map((o) => o.code)).toEqual(["JP"]);
    expect(filterCountries(options, "pt").map((o) => o.code)).toContain("PT");
    expect(filterCountries(options, "")).toHaveLength(options.length);
    expect(filterCountries(options, "zzzz")).toEqual([]);
  });

  it("países escolhidos saem em ordem alfabética pelo nome em português", () => {
    expect(sortSelected(["US", "AR", "DE"], options).map((o) => o.name)).toEqual(["Alemanha", "Argentina", "Estados Unidos"]);
  });
});

describe("formatDays", () => {
  it("formata prazos", () => {
    expect(formatDays(5, 8)).toBe("5 a 8 dias");
    expect(formatDays(1, 1)).toBe("1 dia");
    expect(formatDays(null, 6)).toBe("6 dias");
    expect(formatDays(null, null)).toBe("Prazo não informado");
  });
});
