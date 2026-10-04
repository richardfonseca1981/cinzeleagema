import { describe, expect, it } from "vitest";
import { clampPage, DEFAULT_PAGE_SIZE, getPageItems, MAX_PAGE_SIZE, PAGE_SIZE_OPTIONS, rangeText, totalPages } from "./pagination";

describe("constantes", () => {
  it("padrão 50, opções 25/50/100 e nenhuma passa do máximo do backend", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect([...PAGE_SIZE_OPTIONS]).toEqual([25, 50, 100]);
    expect(Math.max(...PAGE_SIZE_OPTIONS)).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });
});

describe("totalPages", () => {
  it("arredonda para cima e nunca é menor que 1", () => {
    expect(totalPages(76, 50)).toBe(2);
    expect(totalPages(100, 50)).toBe(2);
    expect(totalPages(101, 50)).toBe(3);
    expect(totalPages(1, 100)).toBe(1);
    expect(totalPages(0, 50)).toBe(1);
    expect(totalPages(NaN, 50)).toBe(1);
  });
});

describe("clampPage", () => {
  it("mantém páginas válidas", () => {
    expect(clampPage(1, 5)).toBe(1);
    expect(clampPage(3, 5)).toBe(3);
    expect(clampPage(5, 5)).toBe(5);
  });

  it("ajusta o que passa dos limites", () => {
    expect(clampPage(999, 5)).toBe(5);
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(-3, 5)).toBe(1);
    expect(clampPage(2.7, 5)).toBe(2);
  });

  it("valores inválidos viram 1, mesmo com total de páginas inválido", () => {
    expect(clampPage(NaN, 5)).toBe(1);
    expect(clampPage(3, 0)).toBe(1);
    expect(clampPage(3, NaN)).toBe(1);
  });
});

describe("getPageItems", () => {
  it("1 página: só [1]", () => {
    expect(getPageItems(1, 1)).toEqual([1]);
  });

  it("poucas páginas (até 7): todas, sem reticências", () => {
    expect(getPageItems(1, 2)).toEqual([1, 2]);
    expect(getPageItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("muitas páginas, no início: reticências só no fim", () => {
    expect(getPageItems(1, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 20]);
    expect(getPageItems(4, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 20]);
  });

  it("muitas páginas, no fim: reticências só no começo", () => {
    expect(getPageItems(20, 20)).toEqual([1, "ellipsis-start", 16, 17, 18, 19, 20]);
    expect(getPageItems(17, 20)).toEqual([1, "ellipsis-start", 16, 17, 18, 19, 20]);
  });

  it("muitas páginas, no meio: primeira, última e vizinhas da atual", () => {
    expect(getPageItems(10, 20)).toEqual([1, "ellipsis-start", 9, 10, 11, "ellipsis-end", 20]);
    expect(getPageItems(5, 20)).toEqual([1, "ellipsis-start", 4, 5, 6, "ellipsis-end", 20]);
    expect(getPageItems(16, 20)).toEqual([1, "ellipsis-start", 15, 16, 17, "ellipsis-end", 20]);
  });

  it("8 páginas (primeiro caso com reticências)", () => {
    expect(getPageItems(1, 8)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 8]);
    expect(getPageItems(8, 8)).toEqual([1, "ellipsis-start", 4, 5, 6, 7, 8]);
  });

  it("nunca repete nem omite a página atual, e a barra tem sempre 7 itens com mais de 7 páginas", () => {
    for (const pages of [8, 9, 20, 100]) {
      for (let current = 1; current <= pages; current++) {
        const items = getPageItems(current, pages);
        expect(items).toHaveLength(7);
        expect(items).toContain(current);
        expect(items[0]).toBe(1);
        expect(items[items.length - 1]).toBe(pages);
        const numbers = items.filter((i): i is number => typeof i === "number");
        expect(new Set(numbers).size).toBe(numbers.length);
        expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
      }
    }
  });

  it("página atual fora do intervalo é ajustada", () => {
    expect(getPageItems(999, 20)).toEqual(getPageItems(20, 20));
    expect(getPageItems(0, 20)).toEqual(getPageItems(1, 20));
  });
});

describe("rangeText", () => {
  it("primeira página", () => {
    expect(rangeText(1, 50, 76)).toBe("Mostrando 1–50 de 76 produtos");
  });

  it("última página parcial", () => {
    expect(rangeText(2, 50, 76)).toBe("Mostrando 51–76 de 76 produtos");
    expect(rangeText(3, 25, 76)).toBe("Mostrando 51–75 de 76 produtos");
    expect(rangeText(4, 25, 76)).toBe("Mostrando 76–76 de 76 produtos");
  });

  it("um único produto usa o singular", () => {
    expect(rangeText(1, 50, 1)).toBe("Mostrando 1–1 de 1 produto");
  });

  it("lista vazia", () => {
    expect(rangeText(1, 50, 0)).toBe("Nenhum produto");
  });

  it("página fora do intervalo mostra a última existente", () => {
    expect(rangeText(99, 50, 76)).toBe("Mostrando 51–76 de 76 produtos");
  });
});
