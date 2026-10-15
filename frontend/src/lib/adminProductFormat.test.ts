import { describe, expect, it } from "vitest";
import { formatAdminPrice, formatAdminSize, formatAdminSku, formatAdminWeight } from "./adminProductFormat";

describe("formatAdminWeight", () => {
  it("shows — for 0 (sentinel de ausente)", () => {
    expect(formatAdminWeight(0)).toBe("—");
    expect(formatAdminWeight("0")).toBe("—");
  });

  it("formats grams below 1000", () => {
    expect(formatAdminWeight(12.5)).toBe("12,5g");
  });

  it("formats kg from 1000g up", () => {
    expect(formatAdminWeight(1500)).toBe("1,500kg");
  });
});

describe("formatAdminSize", () => {
  it("shows — for 0", () => {
    expect(formatAdminSize(0)).toBe("—");
  });

  it("formats cm", () => {
    expect(formatAdminSize(2.3)).toBe("2,3cm");
  });
});

describe("formatAdminPrice", () => {
  it("shows Consulte o valor for null", () => {
    expect(formatAdminPrice(null)).toBe("Consulte o valor");
  });

  it("formats currency pt-BR", () => {
    expect(formatAdminPrice(1500)).toBe("R$ 1.500,00");
  });
});

describe("formatAdminSku", () => {
  it("shows — for null or empty", () => {
    expect(formatAdminSku(null)).toBe("—");
    expect(formatAdminSku("")).toBe("—");
    expect(formatAdminSku("   ")).toBe("—");
  });

  it("shows sku when present", () => {
    expect(formatAdminSku("ESM-001")).toBe("ESM-001");
  });
});
