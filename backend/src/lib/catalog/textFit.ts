// Ajusta a descrição dentro de uma caixa fixa (largura x altura do painel):
// tenta tamanhos de fonte decrescentes dentro do intervalo e, se nem o menor
// couber, trunca com reticências (busca binária pelo maior prefixo que
// cabe). `measure` fica a cargo de quem chama (injeta a métrica real do
// PDFKit em produção; nos testes, uma função sintética) — mantém este
// módulo puro e testável sem precisar instanciar um PDFDocument real.
export interface FitTextOptions {
  text: string;
  maxHeight: number;
  minFontSize: number;
  maxFontSize: number;
  // Altura (em pt) que o texto ocuparia se desenhado com este tamanho de
  // fonte, já considerando a largura disponível (quebra de linha).
  measureHeight: (text: string, fontSize: number) => number;
}

export interface FitTextResult {
  text: string;
  fontSize: number;
  truncated: boolean;
  // Altura medida do texto final no tamanho escolhido — permite ao chamador
  // centralizar o bloco no espaço disponível em vez de só ancorá-lo no topo
  // (ver drawProductPage, que usa isto para não deixar um vão grande entre a
  // descrição e a linha dourada quando o texto é curto).
  height: number;
}

export function fitDescriptionText(options: FitTextOptions): FitTextResult {
  const { text, maxHeight, minFontSize, maxFontSize, measureHeight } = options;

  if (!text) return { text: "", fontSize: maxFontSize, truncated: false, height: 0 };

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize--) {
    const height = measureHeight(text, fontSize);
    if (height <= maxHeight) {
      return { text, fontSize, truncated: false, height };
    }
  }

  // Nem o tamanho mínimo coube: busca binária pelo maior número de PALAVRAS
  // INTEIRAS (+ "…") que ainda cabe na altura disponível no tamanho mínimo —
  // nunca corta no meio de uma palavra, e nunca duplica pontuação (o fim da
  // palavra é limpo de pontos/reticências antes de acrescentar a reticência
  // única).
  const words = text.split(/\s+/).filter(Boolean);
  let lo = 0;
  let hi = words.length;
  let best = "…";
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = truncateToWordCount(words, mid);
    if (measureHeight(candidate, minFontSize) <= maxHeight) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { text: best, fontSize: minFontSize, truncated: true, height: measureHeight(best, minFontSize) };
}

// Ajusta um título dentro de um número máximo de LINHAS (não de altura fixa
// em pt, diferente de fitDescriptionText) — ver AJUSTES A4 item 1: "quebrar
// em várias linhas (até 3) e, se ainda não couber, reduzir a fonte em passos
// ... antes de truncar". Para cada tamanho de fonte (de maxFontSize até
// minFontSize), o "orçamento" de altura é maxLines * ALTURA REAL de uma
// linha NESSE tamanho de fonte (ver measureLineHeight) — ou seja, o teste de
// encaixe é sempre "cabe em até maxLines linhas NESTE tamanho de fonte",
// nunca uma altura fixa (que permitiria mais linhas em fontes menores,
// violando o limite de linhas).
//
// BUG CORRIGIDO (rodada de revisão visual): a versão anterior calculava o
// orçamento como `maxLines * fontSize * lineHeightRatio` com um
// lineHeightRatio FIXO assumido (1.15), em vez de medir a altura real de uma
// linha da fonte de verdade (opensans-bolditalic). Essa fonte tem razão
// altura-de-linha/fontSize real de ~1.36 (medido via doc.currentLineHeight),
// bem maior que 1.15 — o orçamento calculado ficava ~15% MENOR que a altura
// real de 3 linhas, então o algoritmo de truncamento (que busca o maior
// texto que cabe NO ORÇAMENTO) parava cedo demais: um título de ~190
// caracteres truncava ocupando só ~2 linhas reais, com a 3ª linha do espaço
// reservado sobrando vazia — nunca cabia de verdade em 3 linhas porque o
// "3 linhas" do cálculo não correspondia a 3 linhas reais. Corrigido ao
// injetar measureLineHeight (altura real medida pelo PDFKit para o
// tamanho/fonte atual, via doc.currentLineHeight) em vez de assumir uma
// razão fixa — elimina a divergência entre o orçamento e a renderização
// real, para qualquer fonte/tamanho, sem precisar calibrar uma constante.
export interface FitTitleOptions {
  text: string;
  maxLines: number;
  minFontSize: number;
  maxFontSize: number;
  // Altura real (em pt) de UMA linha deste tamanho de fonte — ver
  // doc.currentLineHeight() do PDFKit (métrica real da fonte, não uma razão
  // assumida).
  measureLineHeight: (fontSize: number) => number;
  // Altura (em pt) que o texto ocuparia quebrado na largura disponível, já
  // considerando esse tamanho de fonte (mesmo contrato de measureHeight de
  // FitTextOptions).
  measureHeight: (text: string, fontSize: number) => number;
}

export interface FitTitleResult {
  text: string;
  fontSize: number;
  truncated: boolean;
  // Altura real medida do texto final no tamanho escolhido (ver
  // FitTextResult.height — mesmo propósito: permite ao chamador reservar
  // exatamente o espaço necessário, sem sobra nem sobreposição).
  height: number;
}

// Pequena margem para absorver arredondamento de ponto flutuante na
// comparação entre altura medida e orçamento (ex.: texto que ocupa
// EXATAMENTE maxLines linhas não deve ser considerado "não cabe" por uma
// diferença de centésimos de ponto).
const FIT_EPSILON = 0.01;

export function fitTitleText(options: FitTitleOptions): FitTitleResult {
  const { text, maxLines, minFontSize, maxFontSize, measureLineHeight, measureHeight } = options;

  if (!text) return { text: "", fontSize: maxFontSize, truncated: false, height: 0 };

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize--) {
    const budget = maxLines * measureLineHeight(fontSize);
    const height = measureHeight(text, fontSize);
    if (height <= budget + FIT_EPSILON) {
      return { text, fontSize, truncated: false, height };
    }
  }

  // Nem o tamanho mínimo coube em maxLines linhas: busca binária pelo maior
  // número de palavras inteiras (+ "…") que ainda cabe nesse orçamento no
  // tamanho mínimo — mesma lógica de corte de fitDescriptionText (nunca no
  // meio de uma palavra, nunca pontuação duplicada).
  const budget = maxLines * measureLineHeight(minFontSize);
  const words = text.split(/\s+/).filter(Boolean);
  let lo = 0;
  let hi = words.length;
  let best = "…";
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = truncateToWordCount(words, mid);
    if (measureHeight(candidate, minFontSize) <= budget + FIT_EPSILON) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { text: best, fontSize: minFontSize, truncated: true, height: measureHeight(best, minFontSize) };
}

// Últimos caracteres de pontuação/reticência já existentes no fim do trecho
// são removidos antes de acrescentar a reticência — evita "…." ou "……".
const TRAILING_PUNCTUATION = /[.…,;:]+$/u;

// Exportada (além de usada internamente por fitDescriptionText/fitTitleText)
// para o teste de fitTitleText poder montar o mesmo prefixo esperado sem
// duplicar a lógica de junção/limpeza de pontuação.
export function truncateToWordCount(words: string[], count: number): string {
  if (count <= 0) return "…";
  const joined = words.slice(0, count).join(" ").replace(TRAILING_PUNCTUATION, "");
  return `${joined}…`;
}
