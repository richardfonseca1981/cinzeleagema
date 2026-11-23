import sharp from "sharp";
import { TRANSPARENT_BACKGROUND } from "../photoFormat";

// Tamanho recomendado de og:image/twitter:image (summary_large_image):
// 1200x630, ~1.91:1 paisagem — o oposto da foto de produto (9:16 retrato,
// ver photoFormat.ts). Formato de saída sempre JPEG (não WebP): suporte a
// WebP em crawlers de prévia social é inconsistente; JPEG é universal.
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

const BACKGROUND_SHRINK = 8;
const BACKGROUND_BLUR_SIGMA = 6;
const OG_JPEG_QUALITY = 85;

// Deriva o og:image de uma peça a partir da sua foto de capa (9:16,
// retrato): MESMA técnica de "canvas com fundo desfocado" já usada em
// photoFormat.ts (planPortraitCanvas, mode "fit") para fotos fora do 9:16 —
// aqui invertida (retrato -> paisagem). A foto inteira, sem cortar a peça,
// centralizada sobre um fundo = a própria foto reduzida e muito desfocada,
// esticada ao canvas 1200x630. Nunca amplia além do tamanho original.
export async function renderProductOgImage(sourceBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(sourceBuffer).metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const w = swap ? meta.height ?? 0 : meta.width ?? 0;
  const h = swap ? meta.width ?? 0 : meta.height ?? 0;
  if (!(w > 0) || !(h > 0)) throw new Error("Imagem de origem inválida para og:image");

  const scale = Math.min(OG_IMAGE_WIDTH / w, OG_IMAGE_HEIGHT / h, 1);
  const fgWidth = Math.max(1, Math.round(w * scale));
  const fgHeight = Math.max(1, Math.round(h * scale));
  const left = Math.floor((OG_IMAGE_WIDTH - fgWidth) / 2);
  const top = Math.floor((OG_IMAGE_HEIGHT - fgHeight) / 2);

  const foreground = await sharp(sourceBuffer)
    .rotate()
    .resize(fgWidth, fgHeight, { fit: "fill" })
    .flatten({ background: TRANSPARENT_BACKGROUND })
    .toColourspace("srgb")
    .toBuffer();

  const background = await sharp(sourceBuffer)
    .rotate()
    .resize(Math.ceil(OG_IMAGE_WIDTH / BACKGROUND_SHRINK), Math.ceil(OG_IMAGE_HEIGHT / BACKGROUND_SHRINK), {
      fit: "cover",
    })
    .flatten({ background: TRANSPARENT_BACKGROUND })
    .blur(BACKGROUND_BLUR_SIGMA)
    .toColourspace("srgb")
    .resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, { fit: "fill" })
    .toBuffer();

  return sharp(background)
    .composite([{ input: foreground, left, top }])
    .jpeg({ quality: OG_JPEG_QUALITY })
    .toBuffer();
}
