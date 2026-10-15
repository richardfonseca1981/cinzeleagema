import { describe, expect, it } from "vitest";
import {
  digitsOnly,
  formatPostalCode,
  isCompleteBrazilianPostalCode,
  maskBrazilianPostalCode,
  sanitizeForeignPostalCode,
} from "./postalCode";

describe("máscara do CEP (00000-000)", () => {
  it.each([
    ["", ""],
    ["0", "0"],
    ["01001", "01001"],
    ["010010", "01001-0"],
    ["01001000", "01001-000"],
    ["01001-000", "01001-000"],
    ["01.001-000", "01001-000"],
    [" 01001 000 ", "01001-000"],
    ["abc01001000xyz", "01001-000"],
    ["0100100099999", "01001-000"],
  ])("%j → %j", (raw, masked) => {
    expect(maskBrazilianPostalCode(raw)).toBe(masked);
  });

  it("é idempotente (reaplicar a máscara não muda nada, importante ao digitar)", () => {
    for (const raw of ["0", "01001", "010010", "01001000"]) {
      const once = maskBrazilianPostalCode(raw);
      expect(maskBrazilianPostalCode(once)).toBe(once);
    }
  });

  it("apagar o hífen devolve o dígito anterior (sem prender o cursor)", () => {
    expect(maskBrazilianPostalCode("01001-")).toBe("01001");
  });
});

describe("validação do CEP", () => {
  it("só 8 dígitos completam", () => {
    expect(isCompleteBrazilianPostalCode("01001-000")).toBe(true);
    expect(isCompleteBrazilianPostalCode("01001000")).toBe(true);
    expect(isCompleteBrazilianPostalCode("01001-00")).toBe(false);
    expect(isCompleteBrazilianPostalCode("")).toBe(false);
    expect(isCompleteBrazilianPostalCode("abcdefgh")).toBe(false);
    expect(isCompleteBrazilianPostalCode("010010009")).toBe(false); // 9 dígitos: a máscara é quem corta em 8
  });

  it("digitsOnly", () => {
    expect(digitsOnly("01.001-000")).toBe("01001000");
  });
});

describe("outros países: texto livre", () => {
  it("limita o tamanho e não mexe no conteúdo", () => {
    expect(sanitizeForeignPostalCode("SW1A 1AA")).toBe("SW1A 1AA");
    expect(sanitizeForeignPostalCode("x".repeat(40))).toHaveLength(20);
  });

  it("formatPostalCode: máscara no Brasil, texto aparado nos demais", () => {
    expect(formatPostalCode("BR", "01001000")).toBe("01001-000");
    expect(formatPostalCode("GB", "  SW1A 1AA ")).toBe("SW1A 1AA");
    expect(formatPostalCode("US", "")).toBe("");
  });
});
