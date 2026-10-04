import sharp, { type Sharp } from "sharp";
import { removeBackground } from "./rembg";

// Enquadramento automático da peça: recorta em volta da peça, com uma folga,
// para ela ocupar bem o quadro. NUNCA remove o fundo de fotos opacas (o rembg
// só LOCALIZA a peça; o recorte é aplicado na foto original), NUNCA estica e
// NUNCA amplia — só recorta (ou, em PNG transparente, estende a tela com
// transparência quando a folga passa das bordas).

// Pixel com alpha acima disto pertence à peça; abaixo, é transparente.
export const AUTOFIT_ALPHA_THRESHOLD = 16;
// Imagem é tratada como "com transparência" se mais que esta fração dos
// pixels for transparente (alpha < AUTOFIT_ALPHA_THRESHOLD).
export const AUTOFIT_TRANSPARENT_PIXELS_MIN_RATIO = 0.05;
// Respingos isolados são ignorados: uma linha/coluna só conta para a caixa se
// tiver pelo menos max(AUTOFIT_MIN_LINE_PIXELS, esta fração da outra dimensão)
// pixels da peça.
export const AUTOFIT_MIN_LINE_FRACTION = 0.005;
export const AUTOFIT_MIN_LINE_PIXELS = 3;
// Folga em volta da peça, como fração do maior lado da caixa da peça.
export const AUTOFIT_PADDING_RATIO = 0.12;
// Se o maior lado do resultado ficar abaixo disto, o recorte é recusado
// (ficaria pequeno demais para o site).
export const AUTOFIT_MIN_RESULT_LONG_SIDE_PX = 500;
// Se a caixa da peça já ocupa mais que esta fração da área, não há o que fazer.
export const AUTOFIT_ALREADY_FITTED_COVERAGE = 0.7;
// Qualidade ao regravar JPEG/WebP (PNG é sem perda).
export const AUTOFIT_OUTPUT_QUALITY = 90;
// Chamadas ao rembg: tempo máximo e no máximo 1 nova tentativa.
export const AUTOFIT_REMBG_TIMEOUT_MS = 60_000;
export const AUTOFIT_REMBG_MAX_RETRIES = 1;

export type AutoFitAction = "cropped" | "unchanged" | "skipped";
export type AutoFitReason =
  | "already_fitted"
  | "too_small_after_crop"
  | "rembg_unavailable"
  | "subject_not_found"
  | "unsupported_format";

export interface AutoFitMetrics {
  w: number;
  h: number;
  // área da caixa da peça / área da imagem; null quando a peça não pôde ser localizada
  coverage: number | null;
}

export interface AutoFitResult {
  buffer: Buffer;
  contentType: string;
  action: AutoFitAction;
  reason?: AutoFitReason;
  before: AutoFitMetrics;
  after: AutoFitMetrics;
}

export interface AutoFitOptions {
  // Localiza a peça em fotos opacas (padrão: serviço rembg, com timeout e 1 retry).
  // Recebe a foto e devolve uma imagem com alpha em que a peça é opaca.
  removeBackground?: (buffer: Buffer) => Promise<Buffer>;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const SUPPORTED_FORMATS = ["png", "jpeg", "webp"] as const;
type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

const CONTENT_TYPES: Record<SupportedFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

// Caixa dos pixels da peça (alpha > limiar), ignorando respingos isolados.
// Função pura sobre o canal alpha (1 byte por pixel, largura x altura).
export function findSubjectBox(alpha: Uint8Array, width: number, height: number): Box | null {
  const rowCounts = new Uint32Array(height);
  const colCounts = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    const offset = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[offset + x] > AUTOFIT_ALPHA_THRESHOLD) {
        rowCounts[y]++;
        colCounts[x]++;
      }
    }
  }

  const minRowPixels = Math.max(AUTOFIT_MIN_LINE_PIXELS, Math.ceil(AUTOFIT_MIN_LINE_FRACTION * width));
  const minColPixels = Math.max(AUTOFIT_MIN_LINE_PIXELS, Math.ceil(AUTOFIT_MIN_LINE_FRACTION * height));

  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    if (rowCounts[y] >= minRowPixels) {
      if (top === -1) top = y;
      bottom = y;
    }
  }
  let left = -1;
  let right = -1;
  for (let x = 0; x < width; x++) {
    if (colCounts[x] >= minColPixels) {
      if (left === -1) left = x;
      right = x;
    }
  }

  if (top === -1 || left === -1) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function readAlpha(input: Buffer): Promise<{ alpha: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input).rotate().ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  return { alpha: data, width: info.width, height: info.height };
}

async function locateWithRembg(png: Buffer): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= AUTOFIT_REMBG_MAX_RETRIES; attempt++) {
    try {
      return await removeBackground(png, { timeoutMs: AUTOFIT_REMBG_TIMEOUT_MS });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function encode(pipeline: Sharp, format: SupportedFormat): Promise<Buffer> {
  if (format === "png") return pipeline.png().toBuffer();
  if (format === "webp") return pipeline.webp({ quality: AUTOFIT_OUTPUT_QUALITY }).toBuffer();
  return pipeline.jpeg({ quality: AUTOFIT_OUTPUT_QUALITY }).toBuffer();
}

export async function autoFitSubject(input: Buffer, opts: AutoFitOptions = {}): Promise<AutoFitResult> {
  const meta = await sharp(input).metadata();
  const format = meta.format as string | undefined;
  const origW = meta.width ?? 0;
  const origH = meta.height ?? 0;

  if (!format || !(SUPPORTED_FORMATS as readonly string[]).includes(format)) {
    const m = { w: origW, h: origH, coverage: null };
    return { buffer: input, contentType: "application/octet-stream", action: "skipped", reason: "unsupported_format", before: m, after: m };
  }
  const fmt = format as SupportedFormat;
  const contentType = CONTENT_TYPES[fmt];

  const own = await readAlpha(input);
  const { width: W, height: H } = own;

  let transparentPixels = 0;
  for (let i = 0; i < own.alpha.length; i++) if (own.alpha[i] < AUTOFIT_ALPHA_THRESHOLD) transparentPixels++;
  const hasTransparency = transparentPixels / own.alpha.length > AUTOFIT_TRANSPARENT_PIXELS_MIN_RATIO;

  const skipped = (reason: AutoFitReason, coverage: number | null = null): AutoFitResult => {
    const m = { w: W, h: H, coverage };
    return { buffer: input, contentType, action: "skipped", reason, before: m, after: m };
  };

  let mask = own.alpha;
  if (!hasTransparency) {
    // Foto opaca: o rembg só localiza a peça (máscara); o recorte é na original.
    let located: Buffer;
    try {
      const oriented = await sharp(input).rotate().png().toBuffer();
      located = await (opts.removeBackground ?? locateWithRembg)(oriented);
      const resized = await sharp(located).resize(W, H, { fit: "fill" }).ensureAlpha().extractChannel(3).raw().toBuffer();
      mask = resized;
    } catch {
      return skipped("rembg_unavailable");
    }
  }

  const box = findSubjectBox(mask, W, H);
  if (!box) return skipped("subject_not_found");

  const coverageBefore = (box.width * box.height) / (W * H);
  const before: AutoFitMetrics = { w: W, h: H, coverage: coverageBefore };
  if (coverageBefore > AUTOFIT_ALREADY_FITTED_COVERAGE) {
    return { buffer: input, contentType, action: "unchanged", reason: "already_fitted", before, after: before };
  }

  const pad = Math.round(AUTOFIT_PADDING_RATIO * Math.max(box.width, box.height));
  let left = box.left - pad;
  let top = box.top - pad;
  let right = box.left + box.width + pad;
  let bottom = box.top + box.height + pad;

  // Foto opaca nunca passa das bordas; PNG/WebP transparente pode estender a tela.
  if (!hasTransparency) {
    left = Math.max(0, left);
    top = Math.max(0, top);
    right = Math.min(W, right);
    bottom = Math.min(H, bottom);
  }

  const outW = right - left;
  const outH = bottom - top;

  if (outW === W && outH === H && left === 0 && top === 0) {
    return { buffer: input, contentType, action: "unchanged", reason: "already_fitted", before, after: before };
  }
  if (Math.max(outW, outH) < AUTOFIT_MIN_RESULT_LONG_SIDE_PX) {
    return { buffer: input, contentType, action: "skipped", reason: "too_small_after_crop", before, after: before };
  }

  // Interseção com a imagem original + extensão transparente do que passou das bordas.
  const exLeft = Math.max(0, left);
  const exTop = Math.max(0, top);
  const exRight = Math.min(W, right);
  const exBottom = Math.min(H, bottom);

  let pipeline = sharp(input)
    .rotate()
    .extract({ left: exLeft, top: exTop, width: exRight - exLeft, height: exBottom - exTop });

  const extendBy = {
    left: Math.max(0, -left),
    top: Math.max(0, -top),
    right: Math.max(0, right - W),
    bottom: Math.max(0, bottom - H),
  };
  if (extendBy.left || extendBy.top || extendBy.right || extendBy.bottom) {
    pipeline = pipeline.extend({ ...extendBy, background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }

  const buffer = await encode(pipeline, fmt);
  const after: AutoFitMetrics = { w: outW, h: outH, coverage: (box.width * box.height) / (outW * outH) };
  return { buffer, contentType, action: "cropped", before, after };
}

function pct(value: number | null): string {
  return value === null ? "?" : `${Math.round(value * 100)}%`;
}

// Mensagem em português para o admin (preview). "cropped" também descreve o ganho.
export function describeAutoFit(result: AutoFitResult): string {
  if (result.action === "cropped") {
    return `Peça enquadrada: ocupava ${pct(result.before.coverage)} do quadro e agora ocupa ${pct(result.after.coverage)}.`;
  }
  switch (result.reason) {
    case "already_fitted":
      return "A peça já ocupa bem o quadro — não há o que enquadrar.";
    case "too_small_after_crop":
      return `A foto é pequena demais para recortar sem perder nitidez (o resultado ficaria com menos de ${AUTOFIT_MIN_RESULT_LONG_SIDE_PX} px).`;
    case "rembg_unavailable":
      return "Não foi possível localizar a peça agora (serviço de remoção de fundo indisponível). Tente de novo em instantes.";
    case "subject_not_found":
      return "Não encontrei a peça na foto para enquadrar.";
    case "unsupported_format":
      return "Formato de imagem não suportado para o enquadramento (use PNG, JPEG ou WebP).";
    default:
      return "Nenhuma alteração foi necessária.";
  }
}
