import { describe, expect, it } from "vitest";
import { cmToInches, formatWeightSize, gramsToOunces } from "./format";

describe("gramsToOunces", () => {
  it("converts grams to ounces rounded to 2 decimals", () => {
    expect(gramsToOunces(0.62)).toBeCloseTo(0.02, 5);
    expect(gramsToOunces(17.5)).toBeCloseTo(0.62, 5);
    expect(gramsToOunces(1000)).toBeCloseTo(35.27, 5);
  });

  it("rounds instead of truncating", () => {
    // 28.3495g ≈ 1oz — confere que o arredondamento (não truncamento) bate certo
    expect(gramsToOunces(28.3495)).toBeCloseTo(1, 5);
  });
});

describe("cmToInches", () => {
  it("converts centimeters to inches rounded to 2 decimals", () => {
    expect(cmToInches(1.1)).toBeCloseTo(0.43, 5);
    expect(cmToInches(2.54)).toBeCloseTo(1, 5);
    expect(cmToInches(20)).toBeCloseTo(7.87, 5);
  });
});

describe("formatWeightSize", () => {
  it("uses grams/centimeters for pt-BR", () => {
    expect(formatWeightSize(0.62, 1.1, "pt-BR")).toBe("0,62g · 1,1cm");
  });

  it("uses ounces/inches for en, matching the compact 'X.XXoz · X.XXin' pattern", () => {
    expect(formatWeightSize(0.62, 1.1, "en")).toBe("0.02oz · 0.43in");
  });

  it("omits the weight or size segment when zero, in either language", () => {
    expect(formatWeightSize(0, 1.1, "en")).toBe("0.43in");
    expect(formatWeightSize(0.62, 0, "en")).toBe("0.02oz");
    expect(formatWeightSize(0, 0, "en")).toBeNull();
  });
});
