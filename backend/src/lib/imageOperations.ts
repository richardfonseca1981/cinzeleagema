import sharp from "sharp";
import { z } from "zod";
import { removeBackground } from "./rembg";
import { autoFitSubject, type AutoFitResult } from "./autoFit";
import { normalizeToPortrait } from "./photoFormat";

// Lista fechada de operações permitidas — nenhuma outra é aceita, mesmo que
// a Claude API retorne algo diferente (o backend valida de novo aqui).
//
// resize/crop não usam .refine() aqui porque z.discriminatedUnion exige que
// todos os membros sejam ZodObject puro — a validação de "pelo menos um
// campo presente" é feita via .superRefine() no operationSchema abaixo.
const resizeSchema = z.object({
  operation: z.literal("resize"),
  width: z.number().int().positive().max(8000).optional(),
  height: z.number().int().positive().max(8000).optional(),
});

const cropSchema = z.object({
  operation: z.literal("crop"),
  aspectRatio: z.enum(["1:1", "4:3", "9:16"]).optional(),
  width: z.number().int().positive().max(8000).optional(),
  height: z.number().int().positive().max(8000).optional(),
});

const brightnessSchema = z.object({
  operation: z.literal("brightness"),
  value: z.number().int().min(-100).max(100),
});

const contrastSchema = z.object({
  operation: z.literal("contrast"),
  value: z.number().int().min(-100).max(100),
});

const sharpenSchema = z.object({
  operation: z.literal("sharpen"),
  intensity: z.enum(["leve", "médio", "forte"]),
});

const rotateSchema = z.object({
  operation: z.literal("rotate"),
  degrees: z.union([z.literal(90), z.literal(180), z.literal(270)]),
});

const compressSchema = z.object({
  operation: z.literal("compress"),
  quality: z.number().int().min(1).max(100),
});

const convertFormatSchema = z.object({
  operation: z.literal("convertFormat"),
  format: z.enum(["webp", "jpeg", "png"]),
});

const removeBackgroundSchema = z.object({
  operation: z.literal("removeBackground"),
});

// Enquadramento automático da peça (ver lib/autoFit.ts) — sem parâmetros.
const autoFitSchema = z.object({
  operation: z.literal("autoFit"),
});

const enhanceColorSchema = z.object({
  operation: z.literal("enhance_color"),
  level: z.enum(["leve", "medio", "forte"]),
});

export const operationSchema = z
  .discriminatedUnion("operation", [
    resizeSchema,
    cropSchema,
    brightnessSchema,
    contrastSchema,
    sharpenSchema,
    rotateSchema,
    compressSchema,
    convertFormatSchema,
    removeBackgroundSchema,
    autoFitSchema,
    enhanceColorSchema,
  ])
  .superRefine((data, ctx) => {
    if (data.operation === "resize" && data.width === undefined && data.height === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "resize precisa de width e/ou height" });
    }
    if (
      data.operation === "crop" &&
      !data.aspectRatio &&
      (data.width === undefined || data.height === undefined)
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "crop precisa de aspectRatio ou de width e height" });
    }
  });

export const operationsSchema = z.array(operationSchema).min(1).max(5);

export type Operation = z.infer<typeof operationSchema>;

const SHARPEN_SIGMA: Record<"leve" | "médio" | "forte", number> = {
  leve: 0.5,
  médio: 1.5,
  forte: 3,
};

const ASPECT_RATIOS: Record<"1:1" | "4:3" | "9:16", [number, number]> = {
  "1:1": [1, 1],
  "4:3": [4, 3],
  "9:16": [9, 16],
};

function clampMultiplier(value: number): number {
  return Math.max(0.01, value);
}

async function applyResize(buffer: Buffer, op: Extract<Operation, { operation: "resize" }>): Promise<Buffer> {
  return sharp(buffer)
    // Nunca amplia: foto pequena que "pede" 1200 px continua no tamanho original
    // (ampliar só borra e pixela no site).
    .resize(op.width, op.height, { fit: "inside", withoutEnlargement: true })
    .toBuffer();
}

async function applyCrop(buffer: Buffer, op: Extract<Operation, { operation: "crop" }>): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const origWidth = meta.width ?? 1;
  const origHeight = meta.height ?? 1;
  let targetWidth = op.width;
  let targetHeight = op.height;

  if (targetWidth === undefined || targetHeight === undefined) {
    const [ratioW, ratioH] = ASPECT_RATIOS[op.aspectRatio!];

    if (origWidth / origHeight > ratioW / ratioH) {
      targetHeight = origHeight;
      targetWidth = Math.round(origHeight * (ratioW / ratioH));
    } else {
      targetWidth = origWidth;
      targetHeight = Math.round(origWidth * (ratioH / ratioW));
    }
  }

  // Nunca amplia: se o tamanho pedido for maior que a foto, mantém a mesma
  // proporção pedida, mas reduzida até caber na foto original.
  const shrink = Math.min(1, origWidth / targetWidth, origHeight / targetHeight);
  targetWidth = Math.max(1, Math.round(targetWidth * shrink));
  targetHeight = Math.max(1, Math.round(targetHeight * shrink));

  return sharp(buffer).resize(targetWidth, targetHeight, { fit: "cover", position: "centre" }).toBuffer();
}

async function applyContrast(buffer: Buffer, value: number): Promise<Buffer> {
  const a = clampMultiplier(1 + value / 100);
  const b = 128 * (1 - a);
  return sharp(buffer).linear(a, b).toBuffer();
}

async function applyCompress(buffer: Buffer, quality: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  if (meta.format === "png") return sharp(buffer).png({ quality }).toBuffer();
  if (meta.format === "webp") return sharp(buffer).webp({ quality }).toBuffer();
  return sharp(buffer).jpeg({ quality }).toBuffer();
}

// Realce de cor ("vibrance"): satura mais o que já tem pouca cor, preserva
// tons neutros (pele/fundo/pedra sem cor) e protege realces estourados.
// Deliberadamente NÃO usa sharp.normalise() (escurece quando o fundo domina
// o histograma) nem sharp.clahe() (reduz saturação em vez de aumentar) —
// ambos testados e descartados para este caso de uso.
export type ColorEnhanceLevel = "leve" | "medio" | "forte";

const COLOR_ENHANCE_LEVELS: Record<ColorEnhanceLevel, { vib: number; sat: number; sharp: number }> = {
  leve: { vib: 0.35, sat: 1.04, sharp: 0.6 },
  medio: { vib: 0.7, sat: 1.08, sharp: 0.8 },
  forte: { vib: 1.1, sat: 1.12, sharp: 1.0 },
};

// chromaFloor = saturação abaixo da qual o pixel é tratado como neutro e não
// é tocado; o efeito só chega a 100% em 2x esse valor (smoothstep). Com 0,1
// (valor anterior) pedras claras/translúcidas — saturação 0,05-0,15, comuns em
// fotos de joalheria — caíam numa zona morta e o realce não mudava nada
// visível. 0,04 ainda preserva fundos cinza/brancos e o ruído do JPEG (que
// ficam em ~0-0,03) e passa a realçar tons pastéis.
export const DEFAULT_CHROMA_FLOOR = 0.04;

// Exportada separadamente (além de enhanceColor) para ser testada como
// função pura — opera direto no buffer de pixels raw, sem I/O.
export function applyVibrance(
  data: Uint8Array,
  channels: number,
  amount: number,
  chromaFloor = DEFAULT_CHROMA_FLOOR,
  highlightProtect = 0.92
): void {
  for (let i = 0; i < data.length; i += channels) {
    if (channels === 4 && data[i + 3] === 0) continue;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    if (max === 0) continue;
    const s = (max - min) / max;
    const t = Math.min(1, Math.max(0, (s - chromaFloor) / chromaFloor));
    const w = t * t * (3 - 2 * t);
    if (w === 0) continue;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const lum = gray / 255;
    const hl = lum > highlightProtect ? Math.max(0, 1 - (lum - highlightProtect) / (1 - highlightProtect)) : 1;
    let f = 1 + amount * (1 - s) * w * hl;
    for (const c of [r, g, b]) {
      const d = c - gray;
      if (d > 0) f = Math.min(f, (255 - gray) / d);
      else if (d < 0) f = Math.min(f, (0 - gray) / d);
    }
    f = Math.max(1, f);
    data[i] = Math.round(gray + (r - gray) * f);
    data[i + 1] = Math.round(gray + (g - gray) * f);
    data[i + 2] = Math.round(gray + (b - gray) * f);
  }
}

export async function enhanceColor(input: Buffer, level: ColorEnhanceLevel = "medio"): Promise<Buffer> {
  const P = COLOR_ENHANCE_LEVELS[level];
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  applyVibrance(data, info.channels, P.vib);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .modulate({ saturation: P.sat })
    .sharpen({ sigma: 1.0, m1: P.sharp, m2: 2.0 })
    .webp({ quality: 92 })
    .toBuffer();
}

async function applyOperation(buffer: Buffer, op: Operation): Promise<Buffer> {
  switch (op.operation) {
    case "resize":
      return applyResize(buffer, op);
    case "crop":
      return applyCrop(buffer, op);
    case "brightness":
      return sharp(buffer).modulate({ brightness: clampMultiplier(1 + op.value / 100) }).toBuffer();
    case "contrast":
      return applyContrast(buffer, op.value);
    case "sharpen":
      return sharp(buffer).sharpen({ sigma: SHARPEN_SIGMA[op.intensity] }).toBuffer();
    case "rotate":
      return sharp(buffer).rotate(op.degrees).toBuffer();
    case "compress":
      return applyCompress(buffer, op.quality);
    case "convertFormat":
      return sharp(buffer).toFormat(op.format).toBuffer();
    case "removeBackground":
      return removeBackground(buffer);
    case "enhance_color":
      return enhanceColor(buffer, op.level);
    case "autoFit":
      return (await autoFitSubject(buffer)).buffer;
  }
}

// Executa as operações na ordem, SEM a normalização final para 9:16 (usado
// pelos testes de cada operação isolada e por executeOperations).
export async function applyOperations(
  buffer: Buffer,
  ops: Operation[]
): Promise<{ buffer: Buffer; autoFit?: AutoFitResult }> {
  let working = buffer;
  let autoFit: AutoFitResult | undefined;
  for (const op of ops) {
    if (op.operation === "autoFit") {
      // Guarda o relatório (ação/razão/cobertura) para o preview explicar,
      // em português, por que nada foi recortado quando for o caso.
      autoFit = await autoFitSubject(working);
      working = autoFit.buffer;
      continue;
    }
    working = await applyOperation(working, op);
  }
  return { buffer: working, ...(autoFit ? { autoFit } : {}) };
}

export async function executeOperations(
  buffer: Buffer,
  ops: Operation[]
): Promise<{ buffer: Buffer; contentType: string; ext: string; autoFit?: AutoFitResult }> {
  const { buffer: working, autoFit } = await applyOperations(buffer, ops);
  // Todo tratamento sai em 9:16 em pé, com a mesma normalização do upload
  // (foto inteira, sem EXIF/GPS, lado maior <= 1920): nenhuma operação
  // (cortar, girar, remover fundo...) deixa a foto fora do formato do site.
  const final = await normalizeToPortrait(working);
  return { buffer: final.buffer, contentType: final.contentType, ext: `.${final.ext}`, ...(autoFit ? { autoFit } : {}) };
}
