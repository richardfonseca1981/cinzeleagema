import { z } from "zod";

// Mesmo limite de tamanho usado em outros campos de texto curto do admin
// (ver product.schema.ts) — nenhum motivo pra divergir.
const nameSchema = z.string().trim().min(1).max(100);

export const createCategorySchema = z.object({ name: nameSchema });
export const renameCategorySchema = z.object({ name: nameSchema });
export const createSubcategorySchema = z.object({ name: nameSchema });
export const renameSubcategorySchema = z.object({ name: nameSchema });

// DELETE com corpo: sem `moveAffectedToUncategorized`, apagar com peças
// dentro é bloqueado (409) — confirmar explicitamente move tudo para "Sem
// categoria" e apaga, no mesmo passo (ver CONTEXT.md "Categorização").
export const deleteCategorySchema = z.object({
  moveAffectedToUncategorized: z.boolean().optional().default(false),
});
export const deleteSubcategorySchema = z.object({
  moveAffectedToUncategorized: z.boolean().optional().default(false),
});
