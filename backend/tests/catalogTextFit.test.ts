import { describe, expect, it } from "vitest";
import { fitDescriptionText } from "../src/lib/catalog/textFit";

// Métrica sintética: altura proporcional ao comprimento do texto e ao
// tamanho da fonte (sem precisar de um PDFDocument real) — simula uma
// quebra de linha onde cada "linha" cabe ~40 caracteres por unidade de
// fontSize (quanto maior a fonte, menos caracteres cabem por linha).
function fakeMeasure(charsPerLineAtSize1 = 400) {
  return (text: string, fontSize: number) => {
    const charsPerLine = charsPerLineAtSize1 / fontSize;
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
    return lines * fontSize * 1.3;
  };
}

describe("fitDescriptionText", () => {
  it("texto vazio não quebra nada", () => {
    const result = fitDescriptionText({
      text: "",
      maxHeight: 100,
      minFontSize: 11,
      maxFontSize: 16,
      measureHeight: fakeMeasure(),
    });
    expect(result).toEqual({ text: "", fontSize: 16, truncated: false, height: 0 });
  });

  it("texto curto usa o tamanho máximo de fonte", () => {
    const result = fitDescriptionText({
      text: "Peça lapidada à mão, com brilho intenso.",
      maxHeight: 200,
      minFontSize: 11,
      maxFontSize: 16,
      measureHeight: fakeMeasure(),
    });
    expect(result.fontSize).toBe(16);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe("Peça lapidada à mão, com brilho intenso.");
  });

  it("texto mais longo reduz a fonte até caber", () => {
    const longText = "Peça lapidada à mão, ".repeat(10);
    const result = fitDescriptionText({
      text: longText,
      maxHeight: 110,
      minFontSize: 11,
      maxFontSize: 16,
      measureHeight: fakeMeasure(),
    });
    expect(result.fontSize).toBeLessThan(16);
    expect(result.fontSize).toBeGreaterThanOrEqual(11);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe(longText);
  });

  it("texto extremamente longo trunca com reticências no tamanho mínimo", () => {
    const hugeText = "Peça lapidada à mão. ".repeat(100);
    const result = fitDescriptionText({
      text: hugeText,
      maxHeight: 40,
      minFontSize: 11,
      maxFontSize: 16,
      measureHeight: fakeMeasure(),
    });
    expect(result.fontSize).toBe(11);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    expect(result.text.length).toBeLessThan(hugeText.length);
  });

  it("texto truncado cabe dentro da altura máxima informada", () => {
    const hugeText = "Peça lapidada à mão. ".repeat(100);
    const measure = fakeMeasure();
    const result = fitDescriptionText({
      text: hugeText,
      maxHeight: 40,
      minFontSize: 11,
      maxFontSize: 16,
      measureHeight: measure,
    });
    expect(measure(result.text, result.fontSize)).toBeLessThanOrEqual(40);
  });

  it("altura zero ainda devolve só as reticências, sem travar", () => {
    const result = fitDescriptionText({
      text: "Qualquer coisa",
      maxHeight: 0,
      minFontSize: 11,
      maxFontSize: 16,
      measureHeight: fakeMeasure(),
    });
    expect(result.truncated).toBe(true);
    expect(result.text).toBe("…");
  });

  it("nunca corta no meio de uma palavra", () => {
    const text = "Ametista extraordinária com brilho intenso, lapidação impecável e cor profunda rara.";
    const result = fitDescriptionText({ text, maxHeight: 25, minFontSize: 11, maxFontSize: 16, measureHeight: fakeMeasure() });
    expect(result.truncated).toBe(true);

    const withoutEllipsis = result.text.replace(/…$/, "");
    if (withoutEllipsis.length > 0) {
      const matchedWordCount = withoutEllipsis.split(/\s+/).filter(Boolean).length;
      const expectedPrefix = text
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, matchedWordCount)
        .join(" ")
        .replace(/[.…,;:]+$/, "");
      expect(withoutEllipsis).toBe(expectedPrefix);
    }
  });

  it("nunca duplica pontuação ao truncar (sem '….', sem '……')", () => {
    const text = "Pedra natural única, com variações de tom, textura e brilho conforme a luz incide sobre a superfície polida.";
    const result = fitDescriptionText({ text, maxHeight: 20, minFontSize: 11, maxFontSize: 16, measureHeight: fakeMeasure() });
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    expect(result.text).not.toMatch(/…\.|,…|…,|……|\.…/);
  });
});
