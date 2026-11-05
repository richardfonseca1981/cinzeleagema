import { describe, expect, it } from "vitest";
import { formatWeightLabel } from "../src/lib/catalog/pdfPages";

// "850 g" até 999g; a partir de 1000g vira kg com 1 casa decimal (ver
// AJUSTES A4/CATÁLOGO item 4).
describe("formatWeightLabel", () => {
  it("abaixo de 1000g, mostra em gramas inteiras", () => {
    expect(formatWeightLabel(850, "pt")).toBe("850 g");
    expect(formatWeightLabel(1, "pt")).toBe("1 g");
    expect(formatWeightLabel(999, "pt")).toBe("999 g");
  });

  it("arredonda gramas fracionárias para o inteiro mais próximo", () => {
    expect(formatWeightLabel(850.6, "pt")).toBe("851 g");
  });

  it("a partir de 1000g, mostra em kg com separador decimal do idioma", () => {
    expect(formatWeightLabel(1200, "pt")).toBe("1,2 kg");
    expect(formatWeightLabel(1200, "en")).toBe("1.2 kg");
  });

  it("1000g exatos mostra 1 kg (sem decimal supérfluo)", () => {
    expect(formatWeightLabel(1000, "pt")).toBe("1 kg");
  });

  it("peso grande (home decor) formata corretamente", () => {
    expect(formatWeightLabel(15750, "pt")).toBe("15,8 kg");
  });
});
