import { describe, expect, it } from "vitest";
import { computeFloatingPosition } from "./floatingPosition";

const VIEWPORT = { width: 1280, height: 800 };

describe("computeFloatingPosition", () => {
  it("com espaço suficiente embaixo, abre pra baixo ancorado no fundo do botão", () => {
    const anchor = { top: 100, bottom: 130, left: 1000, right: 1100 };
    const pos = computeFloatingPosition(anchor, 288, VIEWPORT);

    expect(pos.openUpward).toBe(false);
    expect(pos.top).toBe(130 + 8);
    expect(pos.bottom).toBeNull();
  });

  it("botão perto do fundo da janela (ex.: barra fixa no rodapé): abre pra CIMA, nunca cortado", () => {
    // Barra de ação fixa no rodapé — botão nos últimos ~60px da janela.
    const anchor = { top: 740, bottom: 780, left: 1000, right: 1100 };
    const pos = computeFloatingPosition(anchor, 288, VIEWPORT);

    expect(pos.openUpward).toBe(true);
    expect(pos.bottom).toBe(VIEWPORT.height - 740 + 8);
    expect(pos.top).toBeNull();
    // A altura máxima nunca estoura o espaço real disponível ACIMA do botão.
    expect(pos.maxHeight).toBeLessThanOrEqual(740 - 8);
  });

  it("perto da borda direita: a borda direita do painel nunca passa da janela", () => {
    const anchor = { top: 100, bottom: 130, left: 1250, right: 1278 };
    const pos = computeFloatingPosition(anchor, 288, VIEWPORT);

    expect(pos.left + 288).toBeLessThanOrEqual(VIEWPORT.width);
    expect(pos.left).toBeGreaterThanOrEqual(0);
  });

  it("perto da borda esquerda: o painel nunca fica com left negativo (não sai da janela)", () => {
    const anchor = { top: 100, bottom: 130, left: 0, right: 40 };
    const pos = computeFloatingPosition(anchor, 288, VIEWPORT);

    expect(pos.left).toBeGreaterThanOrEqual(0);
  });

  it("janela mais estreita que a largura preferida: reduz a largura efetiva (nunca estoura)", () => {
    const narrow = { width: 200, height: 800 };
    const anchor = { top: 100, bottom: 130, left: 50, right: 150 };
    const pos = computeFloatingPosition(anchor, 288, narrow);

    expect(pos.left).toBeGreaterThanOrEqual(0);
    // A janela tem 200px; o painel (largura efetiva clampada) tem que caber.
    expect(pos.left).toBeLessThan(narrow.width);
  });

  it("espaço embaixo E acima pequenos: ainda assim devolve uma altura máxima utilizável (nunca zero/negativa)", () => {
    const anchor = { top: 20, bottom: 780, left: 100, right: 200 };
    const pos = computeFloatingPosition(anchor, 288, VIEWPORT);

    expect(pos.maxHeight).toBeGreaterThan(0);
  });
});
