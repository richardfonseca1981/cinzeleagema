import { z } from "zod";

const attributeSchemaField = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "number", "boolean", "select"]),
  options: z.array(z.string()).optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  attributeSchema: z.array(attributeSchemaField).default([]),
});

export const updateCategorySchema = createCategorySchema.partial();
