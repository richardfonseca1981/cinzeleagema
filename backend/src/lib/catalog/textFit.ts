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

// Últimos caracteres de pontuação/reticência já existentes no fim do trecho
// são removidos antes de acrescentar a reticência — evita "…." ou "……".
const TRAILING_PUNCTUATION = /[.…,;:]+$/u;

function truncateToWordCount(words: string[], count: number): string {
  if (count <= 0) return "…";
  const joined = words.slice(0, count).join(" ").replace(TRAILING_PUNCTUATION, "");
  return `${joined}…`;
}
