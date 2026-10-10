import { z } from "zod";
import { operationsSchema } from "../lib/imageOperations";

// Nome, preço e categoria são opcionais (ver CONTEXT.md "campos opcionais") —
// null é um valor válido e intencional, diferente de ausente (undefined):
// `.nullable()` sozinho (sem `.optional()`) exige a chave no payload, mas
// aceita null nela; o frontend sempre manda a chave (nunca omite), então essa
// é a forma mais estrita que ainda aceita null. "slug" NUNCA vem do cliente —
// é sempre gerado no backend (ver product.routes.ts) e ignorado se enviado.
export const createProductSchema = z.object({
  name: z.string().trim().min(1).nullable(),
  description: z.string().optional().nullable(),
  categoryId: z.string().min(1).nullable(),
  subcategoryId: z.string().optional().nullable(),
  price: z.coerce.number().nonnegative().nullable(),
  sku: z.string().optional().nullable(),
  // nonnegative (não positive): 0 é o sentinel já usado pelo site público
  // para "peso/tamanho ausente" (ver lib/format.ts no frontend) — o próprio
  // default do banco. Positive rejeitava até esse 0 legítimo.
  weightGrams: z.coerce.number().nonnegative().optional(),
  sizeCm: z.coerce.number().nonnegative().optional(),
  trackStock: z.boolean().default(false),
  stockQty: z.coerce.number().int().nonnegative().optional().nullable(),
});

export const updateProductSchema = createProductSchema.partial();

export const listProductsQuerySchema = z.object({
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  categoryId: z.string().min(1).optional(),
  subcategoryId: z.string().min(1).optional(),
  // Busca (painel admin): contém, sem diferenciar maiúsculas de minúsculas,
  // em name e sku. Vazio/só espaços = sem busca (comportamento anterior).
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const reorderImagesSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});

// Nível fechado — qualquer outro valor é rejeitado (mesmo enum do parâmetro
// "level" da operação enhance_color, ver lib/imageOperations.ts).
const colorEnhanceLevelSchema = z.enum(["leve", "medio", "forte"]);

// Atalhos do admin (botões "Realçar cores"/"Mais nitidez"/"Remover fundo")
// mandam "operations" prontas, sem passar pela Claude API — texto livre
// continua mandando só "instruction". Mutuamente exclusivos. Exportados
// separados (além da união) para a rota stateless (multipart, sem JSON body
// nativo) poder validar cada campo que recebe individualmente.
export const treatmentInstructionSchema = z.object({ instruction: z.string().min(1).max(500) });
export const treatmentOperationsRequestSchema = z.object({ operations: operationsSchema });

export const treatmentPreviewSchema = z.union([treatmentInstructionSchema, treatmentOperationsRequestSchema]);

export const treatmentConfirmSchema = z.object({
  previewUrl: z.string().min(1),
  previewKey: z.string().min(1),
  // true quando as operações do preview confirmado incluíam enhance_color —
  // o frontend decide isso inspecionando o array "operations" que já tem em
  // mãos (devolvido pelo próprio /treatment/preview), não há necessidade de
  // o backend adivinhar a partir da imagem.
  colorEnhanced: z.boolean().optional(),
  colorEnhanceLevel: colorEnhanceLevelSchema.optional(),
});

export const treatmentDiscardSchema = z.object({
  previewKey: z.string().min(1),
});
