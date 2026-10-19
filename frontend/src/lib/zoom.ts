// Funções puras de zoom/pan do visualizador em tela cheia (ImageViewer).
// Mantidas sem nenhuma dependência de DOM para serem testadas em isolado —
// o componente só chama essas funções a partir de eventos reais de
// pointer/wheel/teclado.

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampScale(scale: number, min: number = MIN_SCALE, max: number = MAX_SCALE): number {
  return clamp(scale, min, max);
}

// Teto de zoom "com qualidade aceitável": nunca ampliar a foto além do seu
// próprio tamanho em pixels nativos (1 px da foto = 1 px de tela), mesmo que
// o limite técnico (MAX_SCALE) seja maior. Fotos pequenas (ex.: fotos
// antigas fora do padrão 9:16 recomendado) ficam limitadas a um zoom menor em
// vez de pixelar; fotos grandes o bastante usam o limite técnico normal.
export function maxScaleForImage(naturalWidth: number, displayedWidth: number, hardMax: number = MAX_SCALE): number {
  if (!(naturalWidth > 0) || !(displayedWidth > 0)) return hardMax;
  const nativePixelScale = naturalWidth / displayedWidth;
  return clampScale(Math.min(hardMax, nativePixelScale), MIN_SCALE, hardMax);
}

// Limita o deslocamento (pan) para a imagem ampliada nunca deixar uma borda
// vazia dentro do viewport — acima de "scale" 1 a imagem é maior que o
// viewport em (scale-1) vezes a cada lado.
export function clampOffset(offset: Point, scale: number, viewport: Size): Point {
  if (scale <= MIN_SCALE) return { x: 0, y: 0 };
  const maxX = (viewport.width * (scale - 1)) / 2;
  const maxY = (viewport.height * (scale - 1)) / 2;
  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY),
  };
}

// Novo deslocamento para que o ponto sob o cursor/dedo (relativo ao centro
// do viewport) permaneça fixo na tela ao mudar de oldScale para newScale.
export function zoomAtPoint(point: Point, oldOffset: Point, oldScale: number, newScale: number): Point {
  if (oldScale <= 0) return oldOffset;
  const ratio = newScale / oldScale;
  return {
    x: point.x - (point.x - oldOffset.x) * ratio,
    y: point.y - (point.y - oldOffset.y) * ratio,
  };
}

// Toque duplo (ou clique duplo): alterna entre 1x e a escala de destaque.
export function toggleDoubleTapScale(currentScale: number, doubleScale: number = DOUBLE_TAP_SCALE): number {
  return currentScale > MIN_SCALE + 0.01 ? MIN_SCALE : doubleScale;
}

// Roda do mouse: cada "tick" de deltaY aplica um fator exponencial suave,
// sempre dentro do limite [min, max] informado (ver maxScaleForImage).
export function wheelZoomDelta(deltaY: number, currentScale: number, max: number = MAX_SCALE, sensitivity: number = 0.0015): number {
  const factor = Math.exp(-deltaY * sensitivity);
  return clampScale(currentScale * factor, MIN_SCALE, max);
}

export function pinchDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pinchMidpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Um gesto de deslize horizontal (troca de foto) só conta se andou o
// suficiente na horizontal e claramente mais que na vertical — evita
// confundir com rolagem vertical acidental.
export function isHorizontalSwipe(dx: number, dy: number, minDistance: number = 50): boolean {
  return Math.abs(dx) >= minDistance && Math.abs(dx) > Math.abs(dy) * 1.5;
}
