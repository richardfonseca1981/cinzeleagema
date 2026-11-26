// Posicionamento de um painel flutuante (ex.: "Mover para...") ancorado a um
// botão — função pura, sem DOM, pra ser testável isolada. Decide se abre pra
// baixo ou pra cima com base no espaço real disponível na janela (nunca
// assume que sempre há espaço embaixo, que foi o bug original: o painel
// sempre abria pra baixo e, numa barra fixa no rodapé, ficava cortado).

export interface Viewport {
  width: number;
  height: number;
}

// Só os quatro valores de getBoundingClientRect() que importam aqui.
export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FloatingPosition {
  // Exatamente um dos dois é não-nulo — "top" quando abre pra baixo (ancorado
  // pelo topo), "bottom" quando abre pra cima (ancorado pelo fundo). Os dois
  // em `position: fixed` relativos à JANELA (o painel é portado pra
  // document.body, então coordenadas de viewport, não do elemento pai).
  top: number | null;
  bottom: number | null;
  left: number;
  maxHeight: number;
  openUpward: boolean;
}

const MARGIN = 8;
const MIN_HEIGHT = 160;
const MAX_HEIGHT_CAP = 360;

// `preferredWidth`: largura que o painel QUER ter (ex.: 288px) — pode ser
// reduzida se a janela for mais estreita que isso (nunca estoura a tela).
export function computeFloatingPosition(anchor: AnchorRect, preferredWidth: number, viewport: Viewport): FloatingPosition {
  const spaceBelow = viewport.height - anchor.bottom - MARGIN;
  const spaceAbove = anchor.top - MARGIN;

  // Abre pra baixo só se houver espaço mínimo razoável E não for pior do que
  // abrir pra cima — nunca abre pra baixo só porque "é o padrão" se isso
  // cortar a lista (era exatamente o defeito relatado).
  const openUpward = spaceBelow < MIN_HEIGHT && spaceAbove > spaceBelow;

  const available = openUpward ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(Math.min(available, MIN_HEIGHT), Math.min(available, MAX_HEIGHT_CAP));

  const width = Math.min(preferredWidth, Math.max(viewport.width - MARGIN * 2, 0));
  // Alinha a borda direita do painel com a borda direita do botão (botão
  // fica tipicamente no canto direito da barra de ação) — sempre dentro da
  // janela nos dois lados, nunca "colado" fora da borda.
  const left = clamp(anchor.right - width, MARGIN, Math.max(viewport.width - width - MARGIN, MARGIN));

  return openUpward
    ? { top: null, bottom: viewport.height - anchor.top + MARGIN, left, maxHeight, openUpward: true }
    : { top: anchor.bottom + MARGIN, bottom: null, left, maxHeight, openUpward: false };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
