import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional().nullable(),
  price: z.coerce.number().nonnegative(),
  sku: z.string().optional().nullable(),
  weightGrams: z.coerce.number().positive(),
  sizeCm: z.coerce.number().positive(),
  trackStock: z.boolean().default(false),
  stockQty: z.coerce.number().int().nonnegative().optional().nullable(),
});

export const updateProductSchema = createProductSchema.partial();

export const listProductsQuerySchema = z.object({
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const reorderImagesSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});

export const presignImageSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
});

export const confirmImageSchema = z.object({
  url: z.string().min(1),
  key: z.string().min(1),
});

export const treatmentPreviewSchema = z.object({
  instruction: z.string().min(1).max(500),
});

export const treatmentConfirmSchema = z.object({
  previewUrl: z.string().min(1),
  previewKey: z.string().min(1),
});

export const treatmentDiscardSchema = z.object({
  previewKey: z.string().min(1),
});
