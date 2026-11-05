import { describe, expect, it } from "vitest";
import { fitDescriptionText, fitTitleText } from "../src/lib/catalog/textFit";

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

// Métrica sintética para fitTitleText — DELIBERADAMENTE usa uma razão de
// altura de linha "estranha" (1.7, bem diferente de qualquer valor redondo
// que alguém seria tentado a chumbar de volta na implementação, ex. 1.15 ou
// 1.3) e, crucialmente, o orçamento em CADA teste é sempre derivado
// chamando measureLineHeight (nunca recalculando `fontSize * algumNúmero`
// solto no teste) — isso é o que pegaria a regressão real desta rodada: a
// implementação anterior ignorava measureLineHeight e assumia uma razão
// fixa internamente, o que só se manifesta num teste que usa uma razão
// diferente da assumida (ver BUG CORRIGIDO em textFit.ts).
const FAKE_LINE_HEIGHT_RATIO = 1.7;
function fakeLineHeight(fontSize: number): number {
  return fontSize * FAKE_LINE_HEIGHT_RATIO;
}
function fakeTitleMeasure(charsPerLineAtSize1 = 400) {
  return (text: string, fontSize: number) => {
    const charsPerLine = charsPerLineAtSize1 / fontSize;
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
    return lines * fakeLineHeight(fontSize);
  };
}

describe("fitTitleText", () => {
  it("texto vazio não quebra nada", () => {
    const result = fitTitleText({
      text: "",
      maxLines: 3,
      minFontSize: 15,
      maxFontSize: 22,
      measureLineHeight: fakeLineHeight,
      measureHeight: fakeTitleMeasure(),
    });
    expect(result).toEqual({ text: "", fontSize: 22, truncated: false, height: 0 });
  });

  it("título curto (1 linha) usa o tamanho máximo de fonte", () => {
    const result = fitTitleText({
      text: "Ametista Geoda",
      maxLines: 3,
      minFontSize: 15,
      maxFontSize: 22,
      measureLineHeight: fakeLineHeight,
      measureHeight: fakeTitleMeasure(),
    });
    expect(result.text).toBe("Ametista Geoda");
    expect(result.fontSize).toBe(22);
    expect(result.truncated).toBe(false);
  });

  it("título que cabe em até 3 linhas no tamanho máximo não reduz a fonte", () => {
    const measure = fakeTitleMeasure();
    const text = "Topázio Imperial de Ouro Preto com Lapidação";
    // Confirma a premissa do teste antes de testar o comportamento: cabe em
    // até 3 linhas no tamanho máximo (22), usando o MESMO measureLineHeight
    // injetado (nunca uma conta solta no teste).
    expect(measure(text, 22)).toBeLessThanOrEqual(3 * fakeLineHeight(22) + 0.01);

    const result = fitTitleText({
      text,
      maxLines: 3,
      minFontSize: 15,
      maxFontSize: 22,
      measureLineHeight: fakeLineHeight,
      measureHeight: measure,
    });
    expect(result.text).toBe(text);
    expect(result.fontSize).toBe(22);
    expect(result.truncated).toBe(false);
  });

  it("título que só cabe em 3 linhas numa fonte menor reduz a fonte em passos (sem truncar)", () => {
    const measure = fakeTitleMeasure();
    const text = "Esmeralda Colombiana Lapidada à Mão com Laudo Gemológico Completo";

    const result = fitTitleText({
      text,
      maxLines: 3,
      minFontSize: 15,
      maxFontSize: 22,
      measureLineHeight: fakeLineHeight,
      measureHeight: measure,
    });

    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
    expect(result.fontSize).toBeLessThan(22);
    expect(result.fontSize).toBeGreaterThanOrEqual(15);
    expect(measure(text, result.fontSize)).toBeLessThanOrEqual(3 * fakeLineHeight(result.fontSize) + 0.01);
  });

  it("título extremamente longo trunca com reticências no tamanho mínimo, em fim de palavra", () => {
    const text = "Pedra Extraordinária Rara de Origem Desconhecida com Nome Comercial Muito Longo e Detalhado Demais Para Caber";
    const measure = fakeTitleMeasure();

    const result = fitTitleText({
      text,
      maxLines: 3,
      minFontSize: 15,
      maxFontSize: 22,
      measureLineHeight: fakeLineHeight,
      measureHeight: measure,
    });

    expect(result.fontSize).toBe(15);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    expect(result.text.length).toBeLessThan(text.length);
    expect(measure(result.text, 15)).toBeLessThanOrEqual(3 * fakeLineHeight(15) + 0.01);

    // Nunca corta no meio de uma palavra.
    const withoutEllipsis = result.text.replace(/…$/, "");
    const matchedWordCount = withoutEllipsis.split(/\s+/).filter(Boolean).length;
    const expectedPrefix = text
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, matchedWordCount)
      .join(" ")
      .replace(/[.…,;:]+$/, "");
    expect(withoutEllipsis).toBe(expectedPrefix);
  });

  it("REGRESSÃO: orçamento usa a altura real de linha (measureLineHeight), não uma razão chumbada — um título de ~190 chars deve ocupar as 3 linhas do orçamento antes de truncar, não só 2", () => {
    // Reproduz a métrica real que expôs o bug: uma fonte cuja razão
    // altura-de-linha/fontSize (aqui simulada em 1.7) é MAIOR que qualquer
    // valor pequeno (ex. 1.15) que a implementação antiga assumia — se o
    // orçamento ainda fosse calculado com uma razão fixa errada, o texto
    // truncado ocuparia menos que ~3 linhas reais (ficaria MENOR que o
    // orçamento por uma margem grande, não só o epsilon de arredondamento).
    const text =
      "Pedra Extraordinária Rara de Origem Totalmente Desconhecida com Nome Comercial Muito Longo e Detalhado Demais Para Caber em Três Linhas Mesmo no Tamanho Mínimo de Fonte Permitido Pelo Catálogo";
    const measure = fakeTitleMeasure();

    const result = fitTitleText({
      text,
      maxLines: 3,
      minFontSize: 15,
      maxFontSize: 22,
      measureLineHeight: fakeLineHeight,
      measureHeight: measure,
    });

    expect(result.truncated).toBe(true);
    expect(result.fontSize).toBe(15);
    const budget = 3 * fakeLineHeight(15);
    // O texto final deve usar PELO MENOS ~2 linhas e meia do orçamento de 3
    // linhas (não parar em ~2 linhas por um orçamento subestimado) — a
    // mesma métrica sintética aqui simula o espaçamento de linha real.
    expect(result.height).toBeGreaterThan(budget * 0.8);
    expect(result.height).toBeLessThanOrEqual(budget + 0.01);
  });
});
