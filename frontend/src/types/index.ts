// Nível fechado do realce de cor (enhance_color) — mesmo enum validado no
// backend (lib/imageOperations.ts). "medio" sem acento mesmo (consistente
// com o parâmetro aceito pela API, diferente do "médio" acentuado do sharpen).
export type ColorEnhanceLevel = "leve" | "medio" | "forte";

export interface ProductImage {
  id: string;
  url: string;
  key: string;
  position: number;
  // Dimensões da foto exibida; ausentes/null em fotos antigas (proporção desconhecida).
  width?: number | null;
  height?: number | null;
  previousUrl?: string | null;
  previousKey?: string | null;
  colorEnhanced?: boolean;
  colorEnhanceLevel?: ColorEnhanceLevel | null;
}

export interface PhotoTreatmentOperation {
  operation:
    | "resize"
    | "crop"
    | "brightness"
    | "contrast"
    | "sharpen"
    | "rotate"
    | "compress"
    | "convertFormat"
    | "removeBackground"
    | "autoFit"
    | "enhance_color";
  width?: number;
  height?: number;
  aspectRatio?: "1:1" | "4:3" | "9:16";
  value?: number;
  intensity?: "leve" | "médio" | "forte";
  degrees?: 90 | 180 | 270;
  quality?: number;
  format?: "webp" | "jpeg" | "png";
  level?: ColorEnhanceLevel;
}

// Corpo de POST /treatment/preview (e multipart equivalente): texto livre
// (via Claude) OU operações prontas dos atalhos do admin — nunca os dois.
export type TreatmentPreviewRequest = { instruction: string } | { operations: PhotoTreatmentOperation[] };

// "noChange": o tratamento (ex.: "Enquadrar peça" numa foto já enquadrada) não
// alterou a imagem — não há preview, só um aviso em português (notice).
export type PhotoTreatmentNoChange = { unclear: false; noChange: true; operations: PhotoTreatmentOperation[]; notice: string };

export type PhotoTreatmentPreviewReady = {
  unclear: false;
  noChange?: undefined;
  operations: PhotoTreatmentOperation[];
  previewUrl: string;
  previewKey: string;
  notice?: string;
};

export type PhotoTreatmentPreviewResult = { unclear: true; suggestion?: string } | PhotoTreatmentNoChange | PhotoTreatmentPreviewReady;

// Resultado da rota stateless (/api/images/treatment-preview-raw), usada para
// tratar fotos staged (ainda não enviadas ao R2) — a imagem tratada volta
// embutida na resposta em vez de uma URL já hospedada.
export type PhotoTreatmentRawPreviewReady = {
  unclear: false;
  noChange?: undefined;
  operations: PhotoTreatmentOperation[];
  previewDataUrl: string;
  notice?: string;
};

export type PhotoTreatmentRawPreviewResult = { unclear: true; suggestion?: string } | PhotoTreatmentNoChange | PhotoTreatmentRawPreviewReady;

export interface Subcategory {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  subcategories: Subcategory[];
}

export interface Product {
  id: string;
  // Null = peça sem nome ainda (ver CONTEXT.md "campos opcionais"). O site
  // público cai para SKU ou "Peça sem nome" (ver lib/format.ts); o admin
  // mostra "(sem nome)".
  name: string | null;
  slug: string;
  description: string | null;
  // Tradução automática (Claude) — null quando ainda não traduzido ou a
  // tradução falhou; o site público cai para name/description nesse caso.
  nameEn: string | null;
  descriptionEn: string | null;
  // Null = peça sem categoria ainda — aparece só na listagem geral.
  categoryId: string | null;
  subcategoryId: string | null;
  category?: { id: string; name: string; slug: string } | null;
  subcategory?: { id: string; name: string; slug: string; categoryId: string } | null;
  // Null = "Consulte o valor" (nunca entra em carrinho/total). Diferente de
  // "0", que é um preço real.
  price: string | null;
  sku: string | null;
  weightGrams: string;
  sizeCm: string;
  // Dimensões reais da caixa de envio — opcionais, só corrigem a estimativa
  // automática de frete (ver backend lib/shipping/packageEstimator.ts).
  packageLengthCm: string | null;
  packageWidthCm: string | null;
  packageHeightCm: string | null;
  // Fase 1B etapa 10 — override MANUAL de embalagem só pro anúncio do
  // Mercado Livre (nomes novos, nunca os `package*` obsoletos acima, que são
  // do frete nacional do site). "Tudo ou nada": só valem preenchidos juntos.
  mlPackageOverrideLengthCm?: string | null;
  mlPackageOverrideWidthCm?: string | null;
  mlPackageOverrideHeightCm?: string | null;
  mlPackageOverrideWeightG?: string | null;
  // Título aprovado pro anúncio do Mercado Livre — null = nenhuma aprovação
  // ainda (a prévia cai pra sugestão A, marcada "sugerido, não aprovado").
  // Editar mlTitle sempre limpa mlTitleApprovedAt (ver backend).
  mlTitle?: string | null;
  mlTitleApprovedAt?: string | null;
  trackStock: boolean;
  stockQty: number | null;
  images: ProductImage[];
  active: boolean;
  // Fase 1B etapa 7 — marcador de "peça vendida" fora do carrinho do site
  // (ex.: venda presencial ou por outro canal). soldAt null = nunca marcada.
  soldAt?: string | null;
  soldChannel?: SoldChannel | null;
  createdAt: string;
  updatedAt: string;
}

export type SoldChannel = "site" | "mercadolivre" | "other";

// Identificação de catálogo por IA (triagem visual a partir das fotos, nunca
// um laudo gemológico) — listas fechadas, mesmas do backend (ver
// backend/src/schemas/product.schema.ts). Nunca vem no Product público (ver
// product.routes.ts); o admin lê/grava por rotas autenticadas separadas.
export type IdentificationConfidence = "ALTA" | "MEDIA" | "BAIXA";
export type IdentificationTreatment = "NATURAL" | "TINGIDA" | "POSSIVEL_TINGIMENTO" | "SEM_INDICIO";

export interface ProductIdentification {
  identificationPt: string | null;
  identificationEn: string | null;
  confidence: IdentificationConfidence | null;
  treatment: IdentificationTreatment | null;
  note: string | null;
}

// Proposta devolvida por POST /identification/generate — ainda não gravada.
export interface IdentificationProposal {
  identificationPt: string;
  identificationEn: string;
  confidence: IdentificationConfidence;
  treatment: IdentificationTreatment;
  note?: string | null;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminSession {
  token: string;
  admin: { id: string; username: string; role: string };
}

export interface AdminUserSummary {
  id: string;
  username: string;
  role: string;
  active: boolean;
  createdAt: string;
}

export interface CartItem {
  productId: string;
  // Peça sem preço nunca entra no carrinho (ver lib/format.ts
  // canAddToCart) — então, uma vez aqui, o item sempre tem nome resolvido
  // na hora de exibir (ver lib/format.ts localizeProductName), que cai
  // para o SKU quando a peça não tem nome.
  name: string | null;
  nameEn: string | null;
  sku: string | null;
  unitPrice: number;
  imageUrl: string | null;
  weightGrams: number;
  sizeCm: number;
  quantity: number;
}

export interface CreateOrderResult {
  delivered: boolean;
}

// GET /api/shipping/status (admin, somente leitura) — nunca traz valores de
// variáveis, só se estão configuradas. `international` resume a tabela do
// frete internacional (cadastro em /api/admin/shipping).
export interface ShippingStatus {
  domestic: {
    melhorEnvioTokenConfigured: boolean;
    originCepConfigured: boolean;
    sandbox: boolean;
    box: { lengthCm: number; widthCm: number; heightCm: number };
    packagingWeightG: number;
    maxItemSizeCm: number;
    boxFillFactor: number;
  };
  international: { zones: number; activeZones: number; activeCountries: number };
}

// Frete internacional por tabela (admin): /api/admin/shipping.
export interface AdminShippingRate {
  id: string;
  zoneId: string;
  serviceName: string;
  maxWeightG: number;
  priceBRL: number;
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
  active: boolean;
}

export interface AdminShippingZone {
  id: string;
  name: string;
  countries: string[];
  active: boolean;
  position: number;
  rates: AdminShippingRate[];
}

export interface AdminShippingSimulation {
  weightGrams: number;
  result: import("../lib/shipping/types").ShippingQuoteResult;
}

// Catálogo em PDF (Etapa B) — geração assíncrona em segundo plano (ver
// backend/src/lib/catalog/catalogJobs.ts); o admin consulta o status por
// polling até "done"/"error".
export type CatalogLanguage = "pt" | "en";
export type CatalogQuality = "standard" | "light";
// "contain": foto inteira visível, pode deixar faixas laterais ou no
// topo/base. "cover": preenche a área toda, cortando o excedente da foto.
// "trim" (default): recorta o fundo vazio do topo/base antes de aplicar
// "contain" — reduz as faixas sem nunca cortar a peça.
export type CatalogPhotoFit = "contain" | "cover" | "trim";
export type CatalogJobStatusKind = "queued" | "running" | "done" | "error";

export interface CatalogJobRequest {
  productIds?: string[];
  language: CatalogLanguage;
  showPrice: boolean;
  showRef: boolean;
  includeCategoryDividers?: boolean;
  includeContactPage: boolean;
  quality: CatalogQuality;
  photoFit: CatalogPhotoFit;
}

export interface CatalogSkippedItem {
  id: string;
  reason: string;
}

export interface CatalogWarningItem {
  id: string;
  ref: string | null;
  title: string;
  reason: string;
}

// Peça sem descrição e/ou peso e/ou tamanho (ver backend
// generateCatalogPdf.ts CatalogMissingDataEntry) — para o admin completar o
// cadastro; mesmos dados também viram backend/tmp/catalogo-faltando-dados.csv
// no servidor que gerou o catálogo.
export interface CatalogMissingDataItem {
  id: string;
  ref: string | null;
  title: string;
  missingDescription: boolean;
  missingWeight: boolean;
  missingSize: boolean;
}

export interface CatalogJobStatusResponse {
  id: string;
  status: CatalogJobStatusKind;
  progress: { done: number; total: number };
  pageCount: number | null;
  sizeBytes: number | null;
  skipped: CatalogSkippedItem[];
  warnings: CatalogWarningItem[];
  missingData: CatalogMissingDataItem[];
  rate: number | null;
  // Mesma origem/qualidade da cotação do site público (ver lib/exchangeRateQuality.ts).
  rateSource: import("../lib/exchangeRateQuality").RateSource | null;
  rateUpdatedAt: string | null;
  error: string | null;
}

export interface CatalogOptionsCategory {
  id: string;
  name: string;
  count: number;
}

// GET/DELETE /api/admin/mercadolivre/* (Fase 0 — conexão/leitura, sem
// publicação de anúncio ainda). `connected: false` não traz os demais campos.
// Fase 1B etapa 9: publishEnabled/listingTypeConfigured sempre presentes,
// mesmo sem conta conectada e sem nenhuma variável ML_* configurada (ver
// mercadoLivre.routes.ts GET /status, registrada antes do middleware de
// 503) — opcionais aqui só pra não quebrar mocks de teste antigos que não
// os incluem.
export interface MercadoLivreStatus {
  connected: boolean;
  mlUserId?: string;
  nickname?: string;
  expiresAt?: string;
  scope?: string;
  markupPct?: number;
  publishEnabled?: boolean;
  listingTypeConfigured?: boolean;
}

// GET /api/admin/mercadolivre/simulate/:productId (Fase 1A — só monta,
// valida e precifica localmente; nenhuma chamada à API do Mercado Livre,
// funciona mesmo sem conta conectada).
export type MercadoLivreBlockerCode =
  | "inactive"
  | "out_of_stock"
  | "placeholder_title"
  | "missing_price"
  | "placeholder_price"
  | "missing_weight"
  | "missing_size"
  | "no_photos"
  | "photo_too_small";

export type MercadoLivreWarningCode = "review_photo_branding";

export interface MercadoLivreIssue<Code extends string> {
  code: Code;
  message: string;
}

// Estimativa de caixa/peso de embalagem (Fase 1B etapa 4) — ver
// backend/src/lib/mercadoLivre/packagePresets.ts. "ok: false" quando a peça
// excede o maior preset (GG) e não tem override manual válido.
export type MercadoLivrePackagePreset = "P" | "M" | "G" | "GG";

// Fase 1B etapa 10 — `source` distingue override manual (`preset: null`) de
// preset automático (`preset` sempre preenchido nesse caso).
export type MercadoLivrePackageBoxSource = "manual" | "preset";

export type MercadoLivrePackageBoxEstimate =
  | {
      ok: true;
      source: MercadoLivrePackageBoxSource;
      preset: MercadoLivrePackagePreset | null;
      box: { lengthCm: number; widthCm: number; heightCm: number };
      packageWeightGrams: number;
    }
  | { ok: false; reason: "size_exceeds_limit" | "weight_exceeds_limit" | "both_exceed_limit" };

export interface MercadoLivreListingDraft {
  title: string;
  titleTruncated: boolean;
  // true só quando title veio de Product.mlTitle aprovado — false = caiu
  // na sugestão A do titleGenerator (ver backend listingBuilder.ts
  // resolveDraftTitle); "title_not_approved" aparece em issues enquanto for false.
  titleApproved: boolean;
  description: string;
  photos: string[];
  photosOmitted: number;
  // id placeholder (não verificado) enquanto a Fase 1B não confirmar a
  // categoria real via API — ver backend/src/lib/mercadoLivre/categoryFixture.ts.
  category: { id: string; breadcrumb: string[]; verified: boolean };
  basePrice: number;
  packageBox: MercadoLivrePackageBoxEstimate;
  packageBoxSource: MercadoLivrePackageBoxSource | null;
}

// Etapa "título aprovado" — GET /api/admin/mercadolivre/title-suggestions/:productId.
export interface MercadoLivreTitleSuggestions {
  productId: string;
  currentName: string;
  titleA: string | null;
  titleALength: number | null;
  titleB: string | null;
  titleBLength: number | null;
  warnings: MercadoLivreIssue<string>[];
  collisions: { field: "titleA" | "titleB"; productId: string; mlTitle: string }[];
}

export interface MercadoLivrePriceBreakdown {
  basePrice: number;
  markupAmount: number;
  listingPrice: number;
  commissionAmount: number;
  fixedFeeBRL: number;
  shippingCostBRL: number;
  netReceived: number;
  // true quando o respectivo valor NÃO veio da query (caiu no padrão
  // marcado como estimativa não verificada no backend).
  estimatesUsed: { commissionPct: boolean; fixedFeeBRL: boolean; shippingCostBRL: boolean };
}

export interface MercadoLivreSimulationResult {
  productId: string;
  eligible: boolean;
  blockers?: MercadoLivreIssue<MercadoLivreBlockerCode>[];
  warnings: MercadoLivreIssue<MercadoLivreWarningCode>[];
  issues?: MercadoLivreReadinessIssue[];
  draft?: MercadoLivreListingDraft;
  price?: MercadoLivrePriceBreakdown;
}

// Fase 1B etapa 9 — publicação real/prévia (ver backend publisherPayload.ts/
// mercadoLivre.routes.ts POST /publish/:productId). `issues` só aparece em
// dry-run (ver buildMercadoLivreItemPayloadPreview) — modo real nunca
// devolve payload com pendências, ou publica ou bloqueia com erro.
export type MercadoLivreReadinessIssue = "category_not_verified" | "title_not_approved" | "package_requires_manual";

export interface MercadoLivreItemPayload {
  title: string;
  category_id: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  buying_mode: string;
  listing_type_id: string;
  condition: string;
  pictures: { source: string }[];
  seller_custom_field?: string;
  shipping?: { dimensions: string };
}

export interface MercadoLivrePublishResponse {
  productId: string;
  mode: "dry-run" | "real";
  forcedDryRun?: boolean;
  price?: MercadoLivrePriceBreakdown;
  payload?: MercadoLivreItemPayload;
  issues?: MercadoLivreReadinessIssue[];
  // Fase 1B etapa 10 — só presente em dry-run (ver backend
  // buildMercadoLivreItemPayloadPreview).
  packageBoxSource?: MercadoLivrePackageBoxSource | null;
  publishable?: boolean;
  notice?: string | null;
  preview?: { mlItemId: string; permalink: string };
  status?: string;
  mlItemId?: string;
  permalink?: string;
  warning?: string;
  detail?: string;
}

// GET /api/admin/mercadolivre/listings/:productId — registro LOCAL (nunca
// chama a API do Mercado Livre, ver ponto de etapa 9). `status` é sempre uma
// das strings já usadas pelo backend: active/paused/closed/publishing/error.
export interface MercadoLivreListingRecord {
  id: string;
  accountId: string;
  productId: string;
  mlItemId: string | null;
  status: string;
  permalink: string | null;
  categoryId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MercadoLivreListingActionResult {
  productId: string;
  action?: "pause" | "reactivate" | "close";
  status: string;
  mlItemId?: string | null;
  forcedDryRun?: boolean;
  notice?: string;
}

export interface MercadoLivreReconcileResult {
  productId: string;
  status: string;
  reconciled: boolean;
  reason?: string;
  mlItemId?: string;
  permalink?: string;
  candidates?: unknown[];
}

export interface MercadoLivrePauseAllResult {
  total: number;
  succeeded: number;
  results: { productId: string; mlItemId: string | null; ok: boolean; error?: string }[];
}

export interface MercadoLivreSyncResult {
  productId: string;
  status: string;
  mlItemId: string;
  permalink?: string;
  synced: boolean;
}

// Fase 1B etapa 8 (webhook) + 9 (telas admin). `note` é informativo (nunca
// erro — ver schema.prisma MercadoLivreWebhookEvent); `lastError` é falha
// técnica elegível pra reprocessar.
export interface MercadoLivreWebhookEventRecord {
  id: string;
  bodyHash: string;
  resource: string | null;
  topic: string | null;
  receivedAt: string;
  processedAt: string | null;
  lastError: string | null;
  note: string | null;
}

export interface MercadoLivreReprocessResult {
  ok: boolean;
  message: string;
  event: MercadoLivreWebhookEventRecord;
}

// GET /api/admin/mercadolivre/pendencias — agregador do painel "Pendências".
export interface MercadoLivrePendencias {
  pausePending: MercadoLivreListingRecord[];
  stuckPublishing: MercadoLivreListingRecord[];
  webhookErrors: MercadoLivreWebhookEventRecord[];
  webhookNotes: MercadoLivreWebhookEventRecord[];
}
