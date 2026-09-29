import { describe, expect, it } from "vitest";
import { formatWeightSize } from "./format";

describe("formatWeightSize", () => {
  it("uses grams/centimeters for pt-BR, with comma as decimal separator", () => {
    expect(formatWeightSize(0.62, 1.1, "pt-BR")).toBe("0,62g · 1,1cm");
  });

  it("also uses grams/centimeters for en (métrico, sem converter para onças/polegadas), with period as decimal separator", () => {
    expect(formatWeightSize(0.62, 1.1, "en")).toBe("0.62g · 1.1cm");
  });

  it("switches to kg above 1000g in both languages", () => {
    expect(formatWeightSize(1500, 1.1, "pt-BR")).toBe("1,500kg · 1,1cm");
    expect(formatWeightSize(1500, 1.1, "en")).toBe("1.500kg · 1.1cm");
  });

  it("omits the weight or size segment when zero, in either language", () => {
    expect(formatWeightSize(0, 1.1, "en")).toBe("1.1cm");
    expect(formatWeightSize(0.62, 0, "en")).toBe("0.62g");
    expect(formatWeightSize(0, 0, "en")).toBeNull();
  });
});
