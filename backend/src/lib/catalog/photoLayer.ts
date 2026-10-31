import sharp from "sharp";
import { PHOTO_MAX_INPUT_PIXELS } from "../photoFormat";
import { PAGE_WIDTH, PHOTO_AREA_HEIGHT } from "./layout";

// PDFKit 0.20.2 tem um bug real: desenhar DOIS `doc.image()` na mesma página
// (o fundo desfocado via `cover` + a foto via `fit`) antes de qualquer
// `.text()` faz ALGUM texto da página ser renderizado DUAS VEZES — uma vez
// na posição certa e outra "fantasma" perto do topo da página — confirmado
// em dois motores de renderização independentes (poppler e ghostscript,
// então não é um artefato de um visualizador específico), com repro mínimo
// isolado (PDFDocument + 2x doc.image + 1x doc.text, sem nenhum código deste
// projeto). Um ÚNICO `doc.image()` por página não reproduz o bug. Por isso
// a imagem inteira da ÁREA DE FOTO (foto + fundo desfocado) é pré-composta
// AQUI, com sharp, numa única imagem — nenhuma composição de camadas
// acontece mais no PDFKit (ver pdfPages.ts drawProductPage, que desenha só
// essa imagem na área de foto e o painel é um retângulo SEPARADO abaixo,
// sem sobrepor nada — ver AJUSTES VISUAIS (2ª rodada): o painel cobrindo a
// base da foto cortava peças como obelisco/suporte do ovo de ametista).
// "light" (Etapa B, catálogo p/ WhatsApp/e-mail): canvas menor + JPEG mais
// comprimido — mesma foto, bem mais leve. "standard" é o padrão de sempre.
export type CatalogPhotoQuality = "standard" | "light";

const QUALITY_PRESET: Record<CatalogPhotoQuality, { canvasWidth: number; jpegQuality: number }> = {
  standard: { canvasWidth: 1200, jpegQuality: 85 },
  light: { canvasWidth: 1100, jpegQuality: 70 },
};

const BACKGROUND_BLUR_SIGMA = 20;
const BACKGROUND_BRIGHTNESS = 0.3;
const BACKGROUND_SATURATION = 0.5;
// Puxa o fundo desfocado para o navy da marca em vez de deixá-lo escuro na
// cor original da foto (que em fotos de fundo claro/bege ficava cinza-oliva
// em vez de "escuro" — ver REGRAS: "fundo escuro desfocado/escurecido").
const BACKGROUND_TINT = { r: 10, g: 20, b: 38 };

export interface ProcessedCatalogPhoto {
  // Área de foto inteira (mesma proporção largura:PHOTO_AREA_HEIGHT da
  // página) já composta: foto INTEIRA, sem corte nem distorção (contain),
  // centralizada horizontal e verticalmente — a sobra (quando a foto não
  // bate exatamente essa proporção) vira fundo escuro e desfocado da
  // própria foto, preenchendo as laterais por completo (nunca uma faixa
  // cinza lisa). O painel de texto é desenhado por quem chama como uma
  // caixa SEPARADA, abaixo desta imagem — nunca sobrepõe nem corta nada
  // dela (ver AJUSTES VISUAIS, 2ª rodada).
  composite: Buffer;
}

// Processa a foto de capa de uma peça para uma página do catálogo: contida
// (nunca recortada/distorcida) num canvas na proporção da ÁREA DE FOTO da
// página (não a página inteira), reencodada em JPEG (controla o tamanho
// final do arquivo com várias dezenas de fotos — ver REGRAS DE CONTEÚDO e
// `quality` para o modo "light" da Etapa B). `.rotate()` sem argumento
// aplica a orientação EXIF se houver — fotos já tratadas pelo upload do
// site normalmente não têm, mas uma foto antiga pode ter escapado desse
// tratamento.
export async function processCatalogPhoto(raw: Buffer, quality: CatalogPhotoQuality = "standard"): Promise<ProcessedCatalogPhoto> {
  const { canvasWidth, jpegQuality } = QUALITY_PRESET[quality];
  const canvasHeight = Math.round(canvasWidth * (PHOTO_AREA_HEIGHT / PAGE_WIDTH));

  const base = sharp(raw, { limitInputPixels: PHOTO_MAX_INPUT_PIXELS }).rotate();

  const { data: contained, info } = await base
    .clone()
    .resize(canvasWidth, canvasHeight, { fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const background = await sharp(contained)
    .resize({ width: 160 })
    .blur(BACKGROUND_BLUR_SIGMA)
    .modulate({ brightness: BACKGROUND_BRIGHTNESS, saturation: BACKGROUND_SATURATION })
    .tint(BACKGROUND_TINT)
    .resize(canvasWidth, canvasHeight, { fit: "cover" })
    .toBuffer();

  const left = Math.round((canvasWidth - info.width) / 2);
  const top = Math.round((canvasHeight - info.height) / 2);
  const composite = await sharp(background)
    .composite([{ input: contained, left, top }])
    .jpeg({ quality: jpegQuality })
    .toBuffer();

  return { composite };
}
