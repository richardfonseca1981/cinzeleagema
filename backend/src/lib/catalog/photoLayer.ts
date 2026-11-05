import sharp from "sharp";
import { PHOTO_MAX_INPUT_PIXELS } from "../photoFormat";
import { PAGE_WIDTH } from "./layout";

// PDFKit 0.20.2 tem um bug real: desenhar DOIS `doc.image()` na mesma página
// (o fundo desfocado via `cover` + a foto via `fit`) antes de qualquer
// `.text()` faz ALGUM texto da página ser renderizado DUAS VEZES — uma vez
// na posição certa e outra "fantasma" perto do topo da página — confirmado
// em dois motores de renderização independentes (poppler e ghostscript,
// então não é um artefato de um visualizador específico), com repro mínimo
// isolado (PDFDocument + 2x doc.image + 1x doc.text, sem nenhum código deste
// projeto). Um ÚNICO `doc.image()` por página não reproduz o bug. Por isso
// a imagem inteira da ÁREA DE FOTO (foto + fundo desfocado, ou foto cortada
// em modo "cover"/"trim") é pré-composta AQUI, com sharp, numa única imagem
// — nenhuma composição de camadas acontece mais no PDFKit (ver pdfPages.ts
// drawProductPage, que desenha só essa imagem na área de foto e o painel é
// um retângulo SEPARADO abaixo, sem sobrepor nada).
// "light" (Etapa B, catálogo p/ WhatsApp/e-mail): canvas menor + JPEG mais
// comprimido — mesma foto, bem mais leve. "standard" é o padrão de sempre.
export type CatalogPhotoQuality = "standard" | "light";

// "contain": foto INTEIRA visível, sem corte nem distorção, com fundo
// desfocado/escurecido preenchendo a sobra (ver REGRAS: peça sempre
// inteira). "cover": a foto preenche TODA a área, sem nenhuma faixa
// lateral, cortando o excedente. "trim" (default — ver segunda rodada de
// revisão visual): primeiro recorta as faixas de fundo vazio no topo/base
// da própria foto (ver analyzeBackgroundTrim), DEPOIS aplica "contain" na
// foto já recortada — reduz a faixa lateral desfocada sem nunca cortar a
// peça, ao contrário de "cover".
export type CatalogPhotoFit = "contain" | "cover" | "trim";

// Fração vertical (0-1) do excedente cortado em modo "cover" que fica ACIMA
// da janela de corte — ex.: 0.4 corta 40% do excedente de cima e 60% de
// baixo, deslocando a janela de corte para um pouco abaixo do centro
// vertical da foto original (ver AJUSTES revisão visual item 2: "ancorando
// o corte em ~40% a partir do topo"). Só vertical: o corte horizontal
// sempre centraliza (a peça normalmente está centrada na largura da foto).
const COVER_ANCHOR_Y_FRACTION = 0.4;

// Canvas em pixels calculado para a largura física da página A4 (ver
// AJUSTES A4 item 2: "as fotos podem ser redimensionadas para ~150 dpi no
// tamanho final"). dpi = canvasWidth / (PAGE_WIDTH / 72); "standard" visa
// ~150dpi (1240/(595.28/72) ≈ 150dpi), "light" ~109dpi (900/(595.28/72) ≈
// 109dpi) — ambos bem acima da resolução de tela, suficiente para impressão
// leve sem inflar o arquivo final.
const QUALITY_PRESET: Record<CatalogPhotoQuality, { canvasWidth: number; jpegQuality: number }> = {
  standard: { canvasWidth: 1240, jpegQuality: 85 },
  light: { canvasWidth: 900, jpegQuality: 70 },
};

const BACKGROUND_BLUR_SIGMA = 20;
const BACKGROUND_BRIGHTNESS = 0.3;
const BACKGROUND_SATURATION = 0.5;
// Puxa o fundo desfocado para o navy da marca em vez de deixá-lo escuro na
// cor original da foto (que em fotos de fundo claro/bege ficava cinza-oliva
// em vez de "escuro" — ver REGRAS: "fundo escuro desfocado/escurecido").
const BACKGROUND_TINT = { r: 10, g: 20, b: 38 };

export interface TrimInfo {
  // Fração (0-1) da altura ORIGINAL da foto (já com orientação EXIF
  // aplicada) removida do topo/base — 0 quando o modo não é "trim" ou
  // quando a análise não encontrou faixa de fundo cortável (ver
  // analyzeBackgroundTrim). Exposto para o admin poder conferir quanto foi
  // cortado de cada peça (ver AJUSTES revisão visual, 3ª rodada).
  topFraction: number;
  bottomFraction: number;
}

export interface ProcessedCatalogPhoto {
  // Área de foto inteira (mesma proporção largura:altura da área de foto da
  // página NESTA peça — ver AJUSTES revisão visual item 3, a altura da área
  // de foto varia por peça) já composta: em "contain"/"trim", foto INTEIRA
  // (ou já recortada do fundo vazio, em "trim"), sem corte de conteúdo nem
  // distorção, centralizada, com a sobra preenchida por fundo escuro/
  // desfocado da própria foto (nunca uma faixa cinza lisa); em "cover", a
  // foto já vem cortada preenchendo a área inteira, sem sobra. O painel de
  // texto é desenhado por quem chama como uma caixa SEPARADA, abaixo desta
  // imagem — nunca sobrepõe nem corta nada dela.
  composite: Buffer;
  trim: TrimInfo;
}

export interface ProcessCatalogPhotoOptions {
  quality?: CatalogPhotoQuality;
  // Altura (em pt) da área de foto NESTA página — varia por peça desde a
  // introdução do painel de altura compacta (ver layout.ts
  // PHOTO_AREA_MIN/MAX_FRACTION e pdfPages.ts computeProductPanelLayout).
  // Obrigatório porque não há mais um valor fixo único.
  photoAreaHeight: number;
  photoFit?: CatalogPhotoFit;
}

const NO_TRIM: TrimInfo = { topFraction: 0, bottomFraction: 0 };

// Processa a foto de capa de uma peça para uma página do catálogo,
// reencodada em JPEG (controla o tamanho final do arquivo com várias
// dezenas de fotos — ver REGRAS DE CONTEÚDO e `quality` para o modo "light"
// da Etapa B). `.rotate()` sem argumento aplica a orientação EXIF se houver
// — fotos já tratadas pelo upload do site normalmente não têm, mas uma foto
// antiga pode ter escapado desse tratamento.
export async function processCatalogPhoto(raw: Buffer, options: ProcessCatalogPhotoOptions): Promise<ProcessedCatalogPhoto> {
  const { quality = "standard", photoAreaHeight, photoFit = "contain" } = options;
  const { canvasWidth, jpegQuality } = QUALITY_PRESET[quality];
  const canvasHeight = Math.round(canvasWidth * (photoAreaHeight / PAGE_WIDTH));

  if (photoFit === "cover") {
    const composite = await renderCoverPhoto(raw, canvasWidth, canvasHeight, jpegQuality);
    return { composite, trim: NO_TRIM };
  }

  if (photoFit === "trim") {
    const trim = await analyzeBackgroundTrim(raw);
    const rotated = await sharp(raw, { limitInputPixels: PHOTO_MAX_INPUT_PIXELS }).rotate().toBuffer();
    const trimmedInput = await applyTrim(rotated, trim);
    const composite = await renderContainPhoto(trimmedInput, canvasWidth, canvasHeight, jpegQuality);
    return { composite, trim };
  }

  const rotated = await sharp(raw, { limitInputPixels: PHOTO_MAX_INPUT_PIXELS }).rotate().toBuffer();
  const composite = await renderContainPhoto(rotated, canvasWidth, canvasHeight, jpegQuality);
  return { composite, trim: NO_TRIM };
}

// Recebe um buffer JÁ ROTACIONADO (orientação EXIF aplicada) — contido
// (nunca recortado/distorcido) num canvas na proporção pedida, com a sobra
// preenchida por fundo desfocado/escurecido da própria foto.
//
// BUG CORRIGIDO (revisão final, item 3): o código antigo usava
// `withoutEnlargement: true` (equivalente ao `Math.min(..., 1)` abaixo, se
// estivesse presente) — "nunca ampliar" parecia uma proteção razoável
// contra pixelização, mas o objetivo aqui NUNCA foi "nunca ampliar": é
// SEMPRE preencher o eixo dominante exatamente, para o fundo desfocado
// nunca aparecer nesse eixo. Quando a foto (já recortada em modo "trim")
// ficava um pouco MENOR que o canvas nos dois eixos — escala de
// enquadramento pouco acima de 1, ex.: 1,01 — "nunca ampliar" prendia a
// escala em 1 e CENTRALIZAVA a foto no tamanho nativo dentro do canvas,
// deixando uma folga igual nos dois lados do eixo dominante (ex.: SKU 32 no
// modo "trim": ~7px de fundo visível no topo E na base — o "linha clara"
// relatado era a transição abrupta de volta para o fundo escuro bem antes
// da borda real do canvas). Uma ampliação de poucos % é imperceptível (e o
// modo "cover" já amplia sem essa proteção, sem problema) — por isso a
// escala aqui nunca é limitada a 1.
async function renderContainPhoto(rotated: Buffer, canvasWidth: number, canvasHeight: number, jpegQuality: number): Promise<Buffer> {
  const { width: srcWidth, height: srcHeight } = await sharp(rotated).metadata();
  if (!srcWidth || !srcHeight) {
    throw new Error("Não foi possível ler as dimensões da foto para o modo contain");
  }

  const scale = Math.min(canvasWidth / srcWidth, canvasHeight / srcHeight);
  const targetWidth = Math.round(srcWidth * scale);
  const targetHeight = Math.round(srcHeight * scale);

  // fit:"fill" em vez do default "cover": as dimensões-alvo já preservam a
  // proporção original (calculadas com a MESMA escala nos dois eixos), não
  // sobra nada para "cover" cortar — "fill" é só mais previsível (nunca
  // decide cortar por conta própria por causa de um arredondamento de
  // sub-pixel entre targetWidth/targetHeight).
  const contained = await sharp(rotated).resize(targetWidth, targetHeight, { fit: "fill" }).toBuffer();

  const background = await sharp(contained)
    .resize({ width: 160 })
    .blur(BACKGROUND_BLUR_SIGMA)
    .modulate({ brightness: BACKGROUND_BRIGHTNESS, saturation: BACKGROUND_SATURATION })
    .tint(BACKGROUND_TINT)
    .resize(canvasWidth, canvasHeight, { fit: "cover" })
    .toBuffer();

  const left = Math.round((canvasWidth - targetWidth) / 2);
  const top = Math.round((canvasHeight - targetHeight) / 2);
  return sharp(background)
    .composite([{ input: contained, left, top }])
    .jpeg({ quality: jpegQuality })
    .toBuffer();
}

// Modo "cover": escala a foto para cobrir COMPLETAMENTE o canvas (sem
// distorcer, preservando a proporção original) e recorta o excedente —
// horizontalmente sempre centralizado, verticalmente ancorado em
// COVER_ANCHOR_Y_FRACTION (ver comentário da constante). Implementado à mão
// (resize preservando proporção + extract) em vez de `resize({fit:'cover'})`
// porque o fit nativo do sharp só ancora em posições fixas
// (centro/topo/base/atenção/entropia) — não aceita uma fração arbitrária
// como 40%.
async function renderCoverPhoto(raw: Buffer, canvasWidth: number, canvasHeight: number, jpegQuality: number): Promise<Buffer> {
  const base = () => sharp(raw, { limitInputPixels: PHOTO_MAX_INPUT_PIXELS }).rotate();
  const { width: srcWidth, height: srcHeight } = await base().metadata();
  if (!srcWidth || !srcHeight) {
    throw new Error("Não foi possível ler as dimensões da foto para o corte em modo cover");
  }

  const scale = Math.max(canvasWidth / srcWidth, canvasHeight / srcHeight);
  const resizedWidth = Math.max(canvasWidth, Math.ceil(srcWidth * scale));
  const resizedHeight = Math.max(canvasHeight, Math.ceil(srcHeight * scale));

  const resized = await base().resize(resizedWidth, resizedHeight).toBuffer();

  const left = Math.round((resizedWidth - canvasWidth) / 2);
  const maxTop = resizedHeight - canvasHeight;
  const top = Math.min(maxTop, Math.max(0, Math.round(maxTop * COVER_ANCHOR_Y_FRACTION)));

  return sharp(resized)
    .extract({ left, top, width: canvasWidth, height: canvasHeight })
    .jpeg({ quality: jpegQuality })
    .toBuffer();
}

// --- Modo "trim": recorte de fundo vazio no topo/base (ver AJUSTES revisão
// visual, 3ª rodada) -----------------------------------------------------

// Largura do grid de análise — pequena de propósito: redimensionar para
// esta largura já funciona como um filtro passa-baixa natural (cada "pixel"
// do grid é a média de uma região da foto original), suficiente para achar
// faixas de fundo e imune a ruído de sensor pixel-a-pixel, sem precisar de
// suavização extra nem de processar a foto em resolução total (rápido:
// poucos KB de buffer bruto por foto, mesmo numa foto de 20MB+).
const TRIM_ANALYSIS_WIDTH = 60;

// Uma linha do grid de análise é "fundo" quando (a) é internamente quase
// uniforme (desvio padrão de luminosidade baixo) E (b) está perto do tom
// médio amostrado no canto correspondente (topo ou base) — a combinação
// evita classificar como "fundo" uma região de conteúdo que por acaso seja
// bem lisa mas com um tom bem diferente do canto (ex.: uma sombra grande ou
// um reflexo). Calibrados comparando fotos reais do catálogo (ver relatório
// — fundos reais ficam bem abaixo destes limiares; a borda da peça sempre
// produz desvio/salto bem maior).
const TRIM_BACKGROUND_STD_THRESHOLD = 10;
const TRIM_BACKGROUND_MEAN_DIFF_THRESHOLD = 18;

// Nunca cortar mais que 30% da altura original no total (topo + base) — ver
// AJUSTES revisão visual item (limite pedido). Se a análise sugerir mais
// que isso, os dois cortes são reduzidos proporcionalmente (mantendo a
// mesma razão entre topo e base) até caber no limite.
const TRIM_MAX_TOTAL_FRACTION = 0.3;

// Folga preservada ACIMA do início do conteúdo detectado (e abaixo do fim,
// na base) — nunca corta até a borda exata da peça, sempre deixa uma
// margem de respiro (ver AJUSTES revisão visual: "preservar uma folga de
// ~3% acima do conteúdo detectado").
const TRIM_SAFETY_MARGIN_FRACTION = 0.03;

// Faixa (em linhas do grid de análise) amostrada em cada canto para estimar
// o tom do fundo local — pequena o bastante para não alcançar o conteúdo em
// fotos onde ele já começa perto da borda.
const TRIM_CORNER_SAMPLE_FRACTION = 0.02;

interface RowStats {
  mean: number;
  std: number;
}

function computeRowStats(data: Buffer, width: number, y: number): RowStats {
  const rowStart = y * width;
  let sum = 0;
  for (let x = 0; x < width; x++) sum += data[rowStart + x];
  const mean = sum / width;
  let variance = 0;
  for (let x = 0; x < width; x++) {
    const d = data[rowStart + x] - mean;
    variance += d * d;
  }
  return { mean, std: Math.sqrt(variance / width) };
}

function isBackgroundRow(stats: RowStats, cornerMean: number): boolean {
  return stats.std <= TRIM_BACKGROUND_STD_THRESHOLD && Math.abs(stats.mean - cornerMean) <= TRIM_BACKGROUND_MEAN_DIFF_THRESHOLD;
}

// Analisa a foto (já com orientação EXIF resolvida por `.rotate()`) e
// decide quanto cortar do topo/base, SEM alterar o arquivo original — só
// devolve as fatias (0-1) a cortar. Varre de cada borda para dentro,
// linha a linha do grid reduzido, até achar a primeira linha que não é mais
// fundo (ver isBackgroundRow); essa é sempre a fronteira seguida (nunca se
// avança além dela), então o conteúdo nunca é cortado por construção —
// só o limite de 30% e a folga de 3% podem reduzir o corte, nunca
// aumentá-lo além do que foi detectado como fundo.
export async function analyzeBackgroundTrim(raw: Buffer): Promise<TrimInfo> {
  const { data, info } = await sharp(raw, { limitInputPixels: PHOTO_MAX_INPUT_PIXELS })
    .rotate()
    .resize(TRIM_ANALYSIS_WIDTH)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  // Foto baixa demais para ter uma faixa de fundo analisável (não deveria
  // acontecer com fotos reais, mas protege contra um grid degenerado).
  if (height < 10) return NO_TRIM;

  const cornerRows = Math.max(1, Math.round(height * TRIM_CORNER_SAMPLE_FRACTION));

  function cornerMean(fromTop: boolean): number {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < cornerRows; i++) {
      const y = fromTop ? i : height - 1 - i;
      sum += computeRowStats(data, width, y).mean;
      count++;
    }
    return sum / count;
  }

  const topRef = cornerMean(true);
  const bottomRef = cornerMean(false);

  // Primeira linha (do topo) que já não é fundo — tudo ANTES dela é fundo.
  let contentStart = height;
  for (let y = 0; y < height; y++) {
    if (!isBackgroundRow(computeRowStats(data, width, y), topRef)) {
      contentStart = y;
      break;
    }
  }

  // Última linha (da base) que já não é fundo — tudo DEPOIS dela é fundo.
  let contentEnd = -1;
  for (let y = height - 1; y >= 0; y--) {
    if (!isBackgroundRow(computeRowStats(data, width, y), bottomRef)) {
      contentEnd = y;
      break;
    }
  }

  // Análise não confiável (não achou nenhuma linha de conteúdo — foto toda
  // "fundo" segundo o limiar, ou foto tão ruidosa que a primeira linha já
  // não bate com o canto) — não corta nada, cai para o equivalente a
  // "contain" sem recorte (ver AJUSTES revisão visual: "se a análise não
  // for confiável... não cortar nada").
  if (contentEnd < contentStart) return NO_TRIM;

  const margin = Math.round(height * TRIM_SAFETY_MARGIN_FRACTION);
  let topCutRows = Math.max(0, contentStart - margin);
  let bottomCutRows = Math.max(0, height - 1 - contentEnd - margin);

  const maxTotalRows = Math.floor(height * TRIM_MAX_TOTAL_FRACTION);
  const totalCutRows = topCutRows + bottomCutRows;
  if (totalCutRows > maxTotalRows && totalCutRows > 0) {
    const scale = maxTotalRows / totalCutRows;
    topCutRows = Math.floor(topCutRows * scale);
    bottomCutRows = Math.floor(bottomCutRows * scale);
  }

  return { topFraction: topCutRows / height, bottomFraction: bottomCutRows / height };
}

// Aplica o corte decidido por analyzeBackgroundTrim num buffer JÁ ROTACIONADO
// em resolução total — as frações são relativas à altura do GRID de
// análise, que tem a mesma proporção (altura/largura) da foto original
// (resize só muda a largura), então se aplicam igualmente à altura real.
async function applyTrim(rotated: Buffer, trim: TrimInfo): Promise<Buffer> {
  if (trim.topFraction <= 0 && trim.bottomFraction <= 0) return rotated;

  const { width, height } = await sharp(rotated).metadata();
  if (!width || !height) return rotated;

  const topPx = Math.round(height * trim.topFraction);
  const bottomPx = Math.round(height * trim.bottomFraction);
  const croppedHeight = height - topPx - bottomPx;
  if (croppedHeight <= 0) return rotated;

  return sharp(rotated).extract({ left: 0, top: topPx, width, height: croppedHeight }).toBuffer();
}
