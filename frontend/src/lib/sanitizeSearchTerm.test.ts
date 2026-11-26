import { describe, expect, it } from "vitest";
import { sanitizeSearchTerm } from "./sanitizeSearchTerm";

describe("sanitizeSearchTerm", () => {
  it("mantém um termo normal, aparado e em minúsculas", () => {
    expect(sanitizeSearchTerm("  Ametista Uruguaia  ")).toBe("ametista uruguaia");
  });

  it("troca por [redacted] quando o termo parece e-mail", () => {
    expect(sanitizeSearchTerm("cliente@exemplo.com")).toBe("[redacted]");
  });

  it("troca por [redacted] quando o termo parece telefone (8+ dígitos, com separadores)", () => {
    expect(sanitizeSearchTerm("(14) 99822-1804")).toBe("[redacted]");
    expect(sanitizeSearchTerm("14998221804")).toBe("[redacted]");
  });

  it("troca por [redacted] quando o termo parece CPF (11 dígitos)", () => {
    expect(sanitizeSearchTerm("123.456.789-01")).toBe("[redacted]");
  });

  it("troca por [redacted] quando o termo parece CNPJ (14 dígitos)", () => {
    expect(sanitizeSearchTerm("68.854.699/0001-90")).toBe("[redacted]");
  });

  it("corta em 100 caracteres um termo muito longo", () => {
    const long = "a".repeat(150);
    const result = sanitizeSearchTerm(long);
    expect(result).toHaveLength(100);
    expect(result).toBe("a".repeat(100));
  });

  it("não redige um termo curto com poucos dígitos (ex.: '585' de ouro 14k)", () => {
    expect(sanitizeSearchTerm("anel ouro 585")).toBe("anel ouro 585");
  });
});
