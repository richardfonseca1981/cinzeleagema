import sharp from "sharp";
import { z } from "zod";
import { removeBackground } from "./rembg";

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
  aspectRatio: z.enum(["1:1", "4:3", "16:9"]).optional(),
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

const ASPECT_RATIOS: Record<"1:1" | "4:3" | "16:9", [number, number]> = {
  "1:1": [1, 1],
  "4:3": [4, 3],
  "16:9": [16, 9],
};

function clampMultiplier(value: number): number {
  return Math.max(0.01, value);
}

async function applyResize(buffer: Buffer, op: Extract<Operation, { operation: "resize" }>): Promise<Buffer> {
  return sharp(buffer)
    .resize(op.width, op.height, { fit: "inside", withoutEnlargement: false })
    .toBuffer();
}

async function applyCrop(buffer: Buffer, op: Extract<Operation, { operation: "crop" }>): Promise<Buffer> {
  let targetWidth = op.width;
  let targetHeight = op.height;

  if (targetWidth === undefined || targetHeight === undefined) {
    const meta = await sharp(buffer).metadata();
    const origWidth = meta.width ?? 1;
    const origHeight = meta.height ?? 1;
    const [ratioW, ratioH] = ASPECT_RATIOS[op.aspectRatio!];

    if (origWidth / origHeight > ratioW / ratioH) {
      targetHeight = origHeight;
      targetWidth = Math.round(origHeight * (ratioW / ratioH));
    } else {
      targetWidth = origWidth;
      targetHeight = Math.round(origWidth * (ratioH / ratioW));
    }
  }

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
  }
}

function formatMeta(format: string | undefined): { contentType: string; ext: string } {
  if (format === "png") return { contentType: "image/png", ext: ".png" };
  if (format === "webp") return { contentType: "image/webp", ext: ".webp" };
  return { contentType: "image/jpeg", ext: ".jpg" };
}

export async function executeOperations(
  buffer: Buffer,
  ops: Operation[]
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  let working = buffer;
  for (const op of ops) {
    working = await applyOperation(working, op);
  }
  const meta = await sharp(working).metadata();
  const { contentType, ext } = formatMeta(meta.format);
  return { buffer: working, contentType, ext };
}
