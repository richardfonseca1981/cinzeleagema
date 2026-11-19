import { z } from "zod";
import { operationsSchema } from "../lib/imageOperations";
import { SORT_VALUES } from "../lib/productSort";
import { env } from "../lib/env";
import { ML_TITLE_MAX_CHARS } from "../lib/mercadoLivre/listingValidator";
import { containsBannedTerm } from "../lib/mercadoLivre/titleGenerator";
import { containsContactInfoOrStoreName } from "../lib/mercadoLivre/descriptionSanitizer";

// Título APROVADO para uso real no anúncio do Mercado Livre (ver
// Product.mlTitle/mlTitleApprovedAt no schema, lib/mercadoLivre/listingBuilder.ts
// resolveDraftTitle). Validado na ESCRITA (rejeita, nunca limpa em silêncio
// — diferente de sanitizeTitleText/sanitizeMercadoLivreDescriptionText, que
// são usados só na GERAÇÃO automática de sugestão): mesmo limite de 60
// chars do anúncio (ML_TITLE_MAX_CHARS) e as MESMAS listas de termos
// banidos/contato/nome da loja já usadas pelo gerador de sugestões e pelo
// sanitizador da descrição, em vez de duas regras divergindo.
const mlTitleSchema = z
  .string()
  .trim()
  .min(1, "Título não pode ser vazio")
  .max(ML_TITLE_MAX_CHARS, `Título deve ter no máximo ${ML_TITLE_MAX_CHARS} caracteres`)
  .refine((v) => !containsBannedTerm(v), {
    message: "Título não pode conter termos promocionais/de preço ou o nome da loja.",
  })
  .refine((v) => !containsContactInfoOrStoreName(v), {
    message: "Título não pode conter URL, telefone ou o nome da loja.",
  })
  .nullable();

// Nome, preço e categoria são opcionais (ver CONTEXT.md "campos opcionais") —
// null é um valor válido e intencional, diferente de ausente (undefined):
// `.nullable()` sozinho (sem `.optional()`) exige a chave no payload, mas
// aceita null nela; o frontend sempre manda a chave (nunca omite), então essa
// é a forma mais estrita que ainda aceita null. "slug" NUNCA vem do cliente —
// é sempre gerado no backend (ver product.routes.ts) e ignorado se enviado.
const createProductSchemaObject = z.object({
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
  // OBSOLETO: o frete usa sempre a caixa fixa (lib/shipping/shipment.ts).
  // Continuam aceitos só para não quebrar clientes antigos; são ignorados.
  packageLengthCm: z.coerce.number().positive().optional().nullable(),
  packageWidthCm: z.coerce.number().positive().optional().nullable(),
  packageHeightCm: z.coerce.number().positive().optional().nullable(),
  // Fase 1B etapa 10 — override MANUAL de embalagem só para o anúncio do
  // Mercado Livre (nomes novos, nunca reaproveitando os `package*`
  // obsoletos acima, que são de outro contexto — o frete nacional do site).
  // `.max()` usa os tetos configuráveis via env (ML_PACKAGE_OVERRIDE_MAX_*,
  // ver lib/env.ts) — valores padrão documentados ali como SUPOSIÇÃO não
  // verificada. A regra "tudo ou nada" (os 4 juntos, ou nenhum) é aplicada
  // pelo `.refine()` em mlPackageOverrideRefine abaixo, não aqui — um
  // `.object()` sozinho não consegue validar a combinação entre campos.
  mlPackageOverrideLengthCm: z.coerce.number().positive().max(env.ML_PACKAGE_OVERRIDE_MAX_DIMENSION_CM).optional().nullable(),
  mlPackageOverrideWidthCm: z.coerce.number().positive().max(env.ML_PACKAGE_OVERRIDE_MAX_DIMENSION_CM).optional().nullable(),
  mlPackageOverrideHeightCm: z.coerce.number().positive().max(env.ML_PACKAGE_OVERRIDE_MAX_DIMENSION_CM).optional().nullable(),
  mlPackageOverrideWeightG: z.coerce.number().positive().max(env.ML_PACKAGE_OVERRIDE_MAX_WEIGHT_G).optional().nullable(),
  // Título aprovado pro Mercado Livre (ver mlTitleSchema acima). Nunca inclui
  // mlTitleApprovedAt aqui — aprovar é sempre uma ação explícita separada
  // (POST /:id/ml-title/approve|unapprove, ver productStock.routes.ts);
  // editar mlTitle por aqui SEMPRE limpa a aprovação anterior (ver
  // product.routes.ts PATCH /:id).
  mlTitle: mlTitleSchema.optional(),
});

// "Tudo ou nada": os 4 campos do override manual de embalagem (ver acima)
// só valem preenchidos JUNTOS — 1 a 3 preenchidos é rejeitado aqui (400),
// nunca silenciosamente ignorado na gravação (diferente do fallback
// defensivo em packagePresets.ts resolveManualPackageOverride, que é uma
// segunda rede de segurança pra dado gravado por fora desta API). Função
// solta (não um helper genérico envolvendo `.refine()`) de propósito: um
// wrapper genérico sobre `z.ZodType<...>` faz o TypeScript inferir o tipo
// do parâmetro errado (a FORMA da constraint, não a do schema real
// passado) — chamar `.refine()` direto em cada schema concreto evita essa
// pegadinha de inferência.
function hasAllOrNoneMlPackageOverride(data: {
  mlPackageOverrideLengthCm?: number | null;
  mlPackageOverrideWidthCm?: number | null;
  mlPackageOverrideHeightCm?: number | null;
  mlPackageOverrideWeightG?: number | null;
}): boolean {
  const values = [
    data.mlPackageOverrideLengthCm,
    data.mlPackageOverrideWidthCm,
    data.mlPackageOverrideHeightCm,
    data.mlPackageOverrideWeightG,
  ];
  const presentCount = values.filter((value) => value !== null && value !== undefined).length;
  return presentCount === 0 || presentCount === 4;
}

const ML_PACKAGE_OVERRIDE_REFINE_OPTIONS: { message: string; path: (string | number)[] } = {
  message:
    "Embalagem manual para o Mercado Livre: preencha os 4 campos (comprimento, largura, altura e peso do pacote) juntos, ou nenhum deles.",
  path: ["mlPackageOverrideLengthCm"],
};

export const createProductSchema = createProductSchemaObject.refine(hasAllOrNoneMlPackageOverride, ML_PACKAGE_OVERRIDE_REFINE_OPTIONS);
export const updateProductSchema = createProductSchemaObject
  .partial()
  .refine(hasAllOrNoneMlPackageOverride, ML_PACKAGE_OVERRIDE_REFINE_OPTIONS);

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
  // Ordenação do catálogo público (ver lib/productSort.ts); valor fora da
  // lista é 400 (ZodError, tratado em errorHandler.ts).
  sort: z.enum(SORT_VALUES).default("default"),
});

// Fase 1B etapa 7 — canal de venda registrado ao marcar uma peça como
// vendida. String livre no banco (Product.soldChannel) — validado aqui, não
// num enum do Postgres, pra um canal futuro não exigir migration.
export const soldChannelSchema = z.enum(["site", "mercadolivre", "other"]);
export type SoldChannel = z.infer<typeof soldChannelSchema>;

// confirm: z.literal(true) — confirmação explícita booleana (diferente do
// "ENCERRAR"/"PAUSAR TUDO" do Mercado Livre, aqui a ação em si já é dentro
// do próprio admin do site, sem o mesmo risco de digitar errado por engano).
export const markSoldBodySchema = z.object({
  channel: soldChannelSchema,
  confirm: z.literal(true),
});

// Corpo opcional de PATCH /:id/deactivate — pauseMlListing (default false)
// decide se a mesma chamada tenta pausar o anúncio ML "active" encontrado,
// além de só avisar (ver product.routes.ts).
export const deactivateProductBodySchema = z.object({
  pauseMlListing: z.boolean().optional().default(false),
});

// Lista COMPLETA de ids na nova ordem (sem repetidos).
export const reorderProductsSchema = z
  .object({ order: z.array(z.string().min(1)).min(1) })
  .refine((v) => new Set(v.order).size === v.order.length, { message: "Ids repetidos na ordem", path: ["order"] });

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

// Identificação de catálogo por IA (PARTE identificação) — listas fechadas,
// a mesma validação serve tanto para a resposta da IA (lib/productIdentification.ts)
// quanto para o corpo do PUT salvo pelo admin.
export const identificationConfidenceSchema = z.enum(["ALTA", "MEDIA", "BAIXA"]);
export const identificationTreatmentSchema = z.enum(["NATURAL", "TINGIDA", "POSSIVEL_TINGIMENTO", "SEM_INDICIO"]);

// Resposta bruta da IA, validada de novo aqui antes de devolver o preview ao
// admin — nunca confiamos no JSON da ferramenta sem checar a lista fechada.
export const identificationProposalSchema = z.object({
  identificationPt: z.string().trim().min(1).max(60),
  identificationEn: z.string().trim().min(1).max(60),
  confidence: identificationConfidenceSchema,
  treatment: identificationTreatmentSchema,
  note: z.string().trim().max(500).optional().nullable(),
});

// PUT /api/admin/products/:id/identification — o admin manda sempre o estado
// completo da seção (nullable, não optional: aceita limpar qualquer campo,
// mesmo padrão de createProductSchema para campos opcionais do produto).
export const identificationSaveSchema = z.object({
  identificationPt: z.string().trim().min(1).max(60).nullable(),
  identificationEn: z.string().trim().min(1).max(60).nullable(),
  confidence: identificationConfidenceSchema.nullable(),
  treatment: identificationTreatmentSchema.nullable(),
  note: z.string().trim().max(500).nullable(),
});
