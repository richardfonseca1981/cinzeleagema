import os from "os";
import sharp, { type Metadata } from "sharp";
import { HttpError } from "../middleware/errorHandler";

// Formato final das fotos de produto: 9:16 EM PÉ (largura:altura). É o que sai
// do iPhone com o celular em pé e o ajuste "16:9" da câmera (ex.: 4536×8064).
// Estas constantes têm um espelho em frontend/src/lib/photoFormat.ts; o teste
// tests/photoFormat.test.ts garante que os dois arquivos dizem o mesmo.
export const PHOTO_ASPECT_WIDTH = 9;
export const PHOTO_ASPECT_HEIGHT = 16;
// Tolerância relativa na proporção para considerar a foto "já em 9:16".
export const PHOTO_ASPECT_TOLERANCE = 0.03;
// Lado maior da imagem exibida (a foto nunca é guardada maior que isto).
export const PHOTO_MAX_LONG_SIDE = 1920;
// Tamanho mínimo recomendado (abaixo disto o admin recebe um aviso).
export const PHOTO_MIN_WIDTH = 720;
export const PHOTO_MIN_HEIGHT = 1280;

export const PHOTO_OUTPUT_QUALITY = 90;
// Maior arquivo aceito no envio (antes de qualquer processamento).
export const PHOTO_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
// Proteção contra "bombas" de descompressão (36 MP = 4536×8064 passa folgado).
export const PHOTO_MAX_INPUT_PIXELS = 120_000_000;
// Cor de fundo quando a foto tem transparência (não há o que desfocar).
const TRANSPARENT_BACKGROUND = { r: 241, g: 245, b: 249 };
// O fundo desfocado é calculado numa versão reduzida por este fator.
const BACKGROUND_SHRINK = 8;
const BACKGROUND_BLUR_SIGMA = 6;

// Memória sob controle: poucos threads no libvips, cache pequeno e UMA foto
// processada por vez (um arquivo de 36 MP não pode estourar o servidor).
sharp.concurrency(Math.max(1, Math.min(2, os.cpus().length)));
sharp.cache({ memory: 64, files: 0, items: 16 });
const MAX_CONCURRENT_PHOTOS = Math.max(1, Number(process.env.PHOTO_PROCESSING_CONCURRENCY) || 1);

let running = 0;
const waiting: Array<() => void> = [];

async function withPhotoSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_PHOTOS) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

export const HEIC_MESSAGE =
  "Formato HEIC/HEIF não suportado. No iPhone, abra Ajustes > Câmera > Formatos e escolha “Mais Compatível” (JPEG), ou exporte a foto como JPEG antes de enviar.";
export const UNSUPPORTED_MESSAGE = "Formato de imagem não suportado. Envie uma foto em JPEG, PNG ou WebP.";
export const CORRUPT_MESSAGE = "Não foi possível ler a imagem. O arquivo pode estar corrompido; tente exportá-la de novo como JPEG.";
export const TOO_LARGE_MESSAGE = "Foto grande demais. O limite é 15 MB; reduza a qualidade ou o tamanho da foto e tente de novo.";

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

// HEIC/HEIF (HEVC): o sharp pré-compilado não decodifica. Detecta pela caixa
// "ftyp" no início do arquivo para devolver uma mensagem clara em vez de erro
// genérico. AVIF (marca "avif") continua suportado.
export function isHeic(buffer: Buffer): boolean {
  if (buffer.length < 12 || buffer.toString("latin1", 4, 8) !== "ftyp") return false;
  const major = buffer.toString("latin1", 8, 12);
  if (major === "avif" || major === "avis") return false;
  return HEIC_BRANDS.has(major);
}

export function isPortrait916(width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return false;
  const target = PHOTO_ASPECT_WIDTH / PHOTO_ASPECT_HEIGHT;
  return Math.abs(width / height / target - 1) <= PHOTO_ASPECT_TOLERANCE;
}

export type PhotoPlan =
  // Já em 9:16: a foto inteira, só reduzida se passar do limite. Sem recorte.
  | { mode: "keep"; width: number; height: number }
  // Outra proporção: a foto inteira dentro de um canvas 9:16 (fundo desfocado).
  | { mode: "fit"; canvasWidth: number; canvasHeight: number; width: number; height: number; left: number; top: number };

// Função pura: decide o tamanho final a partir das dimensões JÁ orientadas.
// Nunca amplia (escala máxima 1) e nunca corta.
export function planPortraitCanvas(width: number, height: number): PhotoPlan {
  if (isPortrait916(width, height)) {
    const scale = Math.min(1, PHOTO_MAX_LONG_SIDE / Math.max(width, height));
    return { mode: "keep", width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  // Menor canvas 9:16 que contém a foto sem reduzi-la.
  let canvasWidth: number;
  let canvasHeight: number;
  if (width / height > PHOTO_ASPECT_WIDTH / PHOTO_ASPECT_HEIGHT) {
    canvasWidth = width;
    canvasHeight = Math.ceil((width * PHOTO_ASPECT_HEIGHT) / PHOTO_ASPECT_WIDTH);
  } else {
    canvasHeight = height;
    canvasWidth = Math.ceil((height * PHOTO_ASPECT_WIDTH) / PHOTO_ASPECT_HEIGHT);
  }

  const scale = Math.min(1, PHOTO_MAX_LONG_SIDE / canvasHeight);
  const cw = Math.max(1, Math.round(canvasWidth * scale));
  const ch = Math.max(1, Math.round(canvasHeight * scale));
  const w = Math.min(cw, Math.max(1, Math.round(width * scale)));
  const h = Math.min(ch, Math.max(1, Math.round(height * scale)));
  return { mode: "fit", canvasWidth: cw, canvasHeight: ch, width: w, height: h, left: Math.floor((cw - w) / 2), top: Math.floor((ch - h) / 2) };
}

export type PhotoFormatAction = "unchanged" | "kept" | "fitted";

export interface PhotoFormatResult {
  buffer: Buffer;
  contentType: string;
  ext: string;
  action: PhotoFormatAction;
  before: { w: number; h: number };
  after: { w: number; h: number };
}

const PASSTHROUGH: Record<string, { contentType: string; ext: string }> = {
  jpeg: { contentType: "image/jpeg", ext: "jpg" },
  png: { contentType: "image/png", ext: "png" },
  webp: { contentType: "image/webp", ext: "webp" },
};
const ACCEPTED_INPUT = new Set(["jpeg", "png", "webp", "heif", "tiff", "gif"]);

function orientedSize(meta: Metadata): { w: number; h: number } {
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  return (meta.orientation ?? 1) >= 5 ? { w: h, h: w } : { w, h };
}

// Coloca QUALQUER foto no formato final do site:
//  - aplica a orientação EXIF antes de tudo;
//  - 9:16 (tolerância de 3%): sai inteira, sem recorte nem zoom (só reduz se o
//    lado maior passar de 1920 px); se já está limpa (sem EXIF, ≤1920 px) os
//    bytes originais são devolvidos intactos;
//  - outra proporção: a foto inteira, sem ampliar, dentro de um canvas 9:16 com
//    fundo = a própria foto reduzida e muito desfocada (ou cinza claro quando
//    há transparência);
//  - a saída (WebP) nunca carrega EXIF/GPS/ICC.
// Lança HttpError(415/422) com mensagem em português para HEIC, formato
// desconhecido e arquivo ilegível.
export async function normalizeToPortrait(input: Buffer): Promise<PhotoFormatResult> {
  if (isHeic(input)) throw new HttpError(415, HEIC_MESSAGE);

  return withPhotoSlot(async () => {
    let meta: Metadata;
    try {
      meta = await sharp(input, { limitInputPixels: PHOTO_MAX_INPUT_PIXELS }).metadata();
    } catch {
      throw new HttpError(422, CORRUPT_MESSAGE);
    }
    if (!meta.format || !ACCEPTED_INPUT.has(meta.format)) throw new HttpError(415, UNSUPPORTED_MESSAGE);
    if (meta.format === "heif" && meta.compression !== "av1") throw new HttpError(415, HEIC_MESSAGE);

    const { w, h } = orientedSize(meta);
    if (!(w > 0) || !(h > 0)) throw new HttpError(422, CORRUPT_MESSAGE);

    const plan = planPortraitCanvas(w, h);
    const passthrough = PASSTHROUGH[meta.format];
    const clean = !meta.exif && !meta.icc && !meta.xmp && (meta.orientation ?? 1) === 1;
    if (plan.mode === "keep" && plan.width === w && plan.height === h && passthrough && clean) {
      return { buffer: input, ...passthrough, action: "unchanged", before: { w, h }, after: { w, h } };
    }

    try {
      const hasAlpha = Boolean(meta.hasAlpha);
      const channels = hasAlpha ? 4 : 3;
      const fgSize = { w: plan.width, h: plan.height };

      // 1) orienta e reduz (shrink-on-load do libvips mantém a memória baixa)
      let pipeline = sharp(input, { limitInputPixels: PHOTO_MAX_INPUT_PIXELS, failOn: "error" }).rotate();
      pipeline = hasAlpha ? pipeline.ensureAlpha() : pipeline.removeAlpha();
      const { data: fg } = await pipeline
        .resize(fgSize.w, fgSize.h, { fit: "fill" })
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
      const fgRaw = { raw: { width: fgSize.w, height: fgSize.h, channels } } as const;

      if (plan.mode === "keep") {
        const buffer = await sharp(fg, fgRaw).webp({ quality: PHOTO_OUTPUT_QUALITY }).toBuffer();
        return { buffer, contentType: "image/webp", ext: "webp", action: "kept", before: { w, h }, after: { w: fgSize.w, h: fgSize.h } };
      }

      // 2) fundo: a própria foto, reduzida, muito desfocada e esticada ao canvas
      let background: Buffer;
      if (hasAlpha) {
        background = await sharp({
          create: { width: plan.canvasWidth, height: plan.canvasHeight, channels: 3, background: TRANSPARENT_BACKGROUND },
        })
          .raw()
          .toBuffer();
      } else {
        const small = await sharp(fg, fgRaw)
          .resize(Math.ceil(plan.canvasWidth / BACKGROUND_SHRINK), Math.ceil(plan.canvasHeight / BACKGROUND_SHRINK), { fit: "cover" })
          .blur(BACKGROUND_BLUR_SIGMA)
          .raw()
          .toBuffer({ resolveWithObject: true });
        background = await sharp(small.data, { raw: { width: small.info.width, height: small.info.height, channels: 3 } })
          .resize(plan.canvasWidth, plan.canvasHeight, { fit: "fill" })
          .raw()
          .toBuffer();
      }

      // 3) a foto inteira, centralizada, por cima do fundo
      const buffer = await sharp(background, { raw: { width: plan.canvasWidth, height: plan.canvasHeight, channels: 3 } })
        .composite([{ input: fg, raw: fgRaw.raw, left: plan.left, top: plan.top }])
        .webp({ quality: PHOTO_OUTPUT_QUALITY })
        .toBuffer();
      return {
        buffer,
        contentType: "image/webp",
        ext: "webp",
        action: "fitted",
        before: { w, h },
        after: { w: plan.canvasWidth, h: plan.canvasHeight },
      };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(422, CORRUPT_MESSAGE);
    }
  });
}
