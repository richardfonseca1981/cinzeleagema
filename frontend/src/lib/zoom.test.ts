import { describe, expect, it } from "vitest";
import {
  clampOffset,
  clampScale,
  DOUBLE_TAP_SCALE,
  isHorizontalSwipe,
  MAX_SCALE,
  MIN_SCALE,
  maxScaleForImage,
  pinchDistance,
  pinchMidpoint,
  toggleDoubleTapScale,
  wheelZoomDelta,
  zoomAtPoint,
} from "./zoom";

describe("clampScale", () => {
  it("nunca deixa passar de 1x–4x (padrão)", () => {
    expect(clampScale(0.3)).toBe(MIN_SCALE);
    expect(clampScale(10)).toBe(MAX_SCALE);
    expect(clampScale(2.5)).toBe(2.5);
  });

  it("aceita limites customizados", () => {
    expect(clampScale(5, 1, 3)).toBe(3);
    expect(clampScale(0, 1, 3)).toBe(1);
  });
});

describe("maxScaleForImage", () => {
  it("foto grande o bastante: usa o limite técnico (4x)", () => {
    expect(maxScaleForImage(4000, 400)).toBe(MAX_SCALE);
  });

  it("foto pequena: limita ao próprio tamanho em pixels nativos", () => {
    // Exibida a 400px de largura, nativa 600px -> no máximo 1.5x.
    expect(maxScaleForImage(600, 400)).toBe(1.5);
  });

  it("foto menor que a tela exibida (abaixo de 1x): nunca devolve menos que 1x", () => {
    expect(maxScaleForImage(200, 400)).toBe(MIN_SCALE);
  });

  it("medidas ainda não disponíveis (0/negativo): usa o limite técnico", () => {
    expect(maxScaleForImage(0, 400)).toBe(MAX_SCALE);
    expect(maxScaleForImage(400, 0)).toBe(MAX_SCALE);
  });
});

describe("clampOffset", () => {
  const viewport = { width: 300, height: 600 };

  it("sem zoom (escala 1x): sempre volta para o centro", () => {
    expect(clampOffset({ x: 999, y: -999 }, 1, viewport)).toEqual({ x: 0, y: 0 });
  });

  it("com zoom: não deixa a imagem sair da tela (clamp nas bordas)", () => {
    // scale 2x -> metade do viewport de margem em cada lado.
    expect(clampOffset({ x: 1000, y: 1000 }, 2, viewport)).toEqual({ x: 150, y: 300 });
    expect(clampOffset({ x: -1000, y: -1000 }, 2, viewport)).toEqual({ x: -150, y: -300 });
  });

  it("dentro do limite: mantém o valor", () => {
    expect(clampOffset({ x: 10, y: -20 }, 2, viewport)).toEqual({ x: 10, y: -20 });
  });
});

describe("zoomAtPoint", () => {
  it("ampliando a partir do centro (offset 0): o centro permanece fixo", () => {
    expect(zoomAtPoint({ x: 0, y: 0 }, { x: 0, y: 0 }, 1, 2)).toEqual({ x: 0, y: 0 });
  });

  it("ampliando a partir de um ponto fora do centro: desloca para manter o ponto fixo", () => {
    const result = zoomAtPoint({ x: 100, y: 50 }, { x: 0, y: 0 }, 1, 2);
    expect(result).toEqual({ x: -100, y: -50 });
  });

  it("reduzindo de volta: desfaz o deslocamento (ida e volta é identidade)", () => {
    const zoomedIn = zoomAtPoint({ x: 100, y: 50 }, { x: 0, y: 0 }, 1, 2);
    const back = zoomAtPoint({ x: 100, y: 50 }, zoomedIn, 2, 1);
    expect(back.x).toBeCloseTo(0);
    expect(back.y).toBeCloseTo(0);
  });
});

describe("toggleDoubleTapScale", () => {
  it("em 1x, duplo toque vai para a escala de destaque", () => {
    expect(toggleDoubleTapScale(1)).toBe(DOUBLE_TAP_SCALE);
  });

  it("ampliado, duplo toque volta para 1x", () => {
    expect(toggleDoubleTapScale(2.5)).toBe(MIN_SCALE);
    expect(toggleDoubleTapScale(4)).toBe(MIN_SCALE);
  });

  it("aceita uma escala de destaque customizada (ex.: limitada pela qualidade da foto)", () => {
    expect(toggleDoubleTapScale(1, 1.5)).toBe(1.5);
  });
});

describe("wheelZoomDelta", () => {
  it("deltaY negativo (roda para frente) amplia", () => {
    expect(wheelZoomDelta(-100, 1)).toBeGreaterThan(1);
  });

  it("deltaY positivo (roda para trás) reduz", () => {
    expect(wheelZoomDelta(100, 2)).toBeLessThan(2);
  });

  it("nunca passa do máximo informado nem do mínimo (1x)", () => {
    expect(wheelZoomDelta(-100000, 1, 4)).toBe(4);
    expect(wheelZoomDelta(100000, 2, 4)).toBe(MIN_SCALE);
  });
});

describe("pinchDistance / pinchMidpoint", () => {
  it("calcula a distância euclidiana entre dois dedos", () => {
    expect(pinchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("calcula o ponto médio entre dois dedos", () => {
    expect(pinchMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
});

describe("isHorizontalSwipe", () => {
  it("deslize horizontal claro: conta como swipe", () => {
    expect(isHorizontalSwipe(80, 5)).toBe(true);
    expect(isHorizontalSwipe(-80, -5)).toBe(true);
  });

  it("deslize curto demais: não conta", () => {
    expect(isHorizontalSwipe(20, 2)).toBe(false);
  });

  it("deslize mais vertical que horizontal (rolagem): não conta", () => {
    expect(isHorizontalSwipe(60, 55)).toBe(false);
  });
});
