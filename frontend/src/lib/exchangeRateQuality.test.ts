import { describe, expect, it } from "vitest";
import { RATE_MAX_AGE_MS, formatRateForMessage, isRateStale } from "./exchangeRateQuality";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");

describe("isRateStale — só quando dá para provar que tem mais de 24 horas", () => {
  it("o limite é de 24 horas", () => {
    expect(RATE_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("atualizada agora ou há poucas horas: não está desatualizada", () => {
    expect(isRateStale("2026-10-05T12:00:00.000Z", NOW)).toBe(false);
    expect(isRateStale("2026-10-05T01:00:00.000Z", NOW)).toBe(false);
  });

  it("exatamente 24 h ainda vale; 1 ms a mais já é desatualizada", () => {
    expect(isRateStale(new Date(NOW - RATE_MAX_AGE_MS).toISOString(), NOW)).toBe(false);
    expect(isRateStale(new Date(NOW - RATE_MAX_AGE_MS - 1).toISOString(), NOW)).toBe(true);
  });

  it("dias atrás: desatualizada", () => {
    expect(isRateStale("2026-10-01T12:00:00.000Z", NOW)).toBe(true);
  });

  it("sem data, vazia ou inválida: não dá para saber, então NÃO marca como desatualizada", () => {
    expect(isRateStale(null, NOW)).toBe(false);
    expect(isRateStale(undefined, NOW)).toBe(false);
    expect(isRateStale("", NOW)).toBe(false);
    expect(isRateStale("ontem", NOW)).toBe(false);
  });

  it("data no futuro (relógio do aparelho atrasado): não marca", () => {
    expect(isRateStale("2026-10-06T12:00:00.000Z", NOW)).toBe(false);
  });
});

describe("formatRateForMessage — 2 casas decimais, ponto decimal", () => {
  it.each([
    [5.3, "5.30"],
    [5.3249, "5.32"],
    [5.325, "5.33"],
    [5, "5.00"],
    [5.32, "5.32"],
    [5.335, "5.34"],
    [5.994, "5.99"],
    [5.995, "6.00"],
    [10.5, "10.50"],
  ])("%s → %s", (rate, expected) => {
    expect(formatRateForMessage(rate)).toBe(expected);
  });

  it("nunca usa vírgula nem separador de milhar", () => {
    expect(formatRateForMessage(1234.5)).toBe("1234.50");
    expect(formatRateForMessage(5.3)).not.toContain(",");
  });
});
