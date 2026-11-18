import { resolveTitle, isPlaceholderTitle, type CatalogProductContent } from "../catalog/content";
import { PLACEHOLDER_PRICE_MAX } from "../catalog/generateCatalogPdf";

// Mínimo de resolução exigido pelo Mercado Livre para fotos de anúncio
// (documentação pública — não bloqueado pelo mesmo 403 que impediu consultar
// categorias/atributos, por ser uma regra textual estável, não um endpoint).
export const ML_MIN_PHOTO_PX = 500;
export const ML_MAX_PHOTOS = 12;
export const ML_TITLE_MAX_CHARS = 60;

export interface ListingValidationImage {
  width: number | null;
  height: number | null;
}

// Mesmo subconjunto de campos do Product que sitemapEligibility.ts usa (ver
// feat/seo-rodada1) — reaproveita CatalogProductContent em vez de redefinir
// os campos de título/corpo.
export interface ListingValidationInput extends CatalogProductContent {
  id: string;
  price: unknown; // Decimal do Prisma ou já convertido.
  active: boolean;
  trackStock: boolean;
  stockQty: number | null;
  weightGrams: unknown; // idem price
  sizeCm: unknown;
  images: ListingValidationImage[];
}

export type ListingBlockerCode =
  | "inactive"
  | "out_of_stock"
  | "placeholder_title"
  | "missing_price"
  | "placeholder_price"
  | "missing_weight"
  | "missing_size"
  | "no_photos"
  | "photo_too_small";

export type ListingWarningCode = "review_photo_branding" | "unknown_photo_dimension";

export interface ListingValidationIssue<Code extends string> {
  code: Code;
  message: string;
}

export interface ListingValidationResult {
  eligible: boolean;
  blockers: ListingValidationIssue<ListingBlockerCode>[];
  warnings: ListingValidationIssue<ListingWarningCode>[];
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Foto "legado" sem width/height gravados (ver ProductImage.width/height no
// schema: null em fotos antigas, "a trocar") — usado pelo validador E pelo
// script de auditoria (contagem na coluna do CSV), para as duas fontes
// nunca divergirem sobre o que conta como "dimensão desconhecida".
export function hasUnknownDimension(image: ListingValidationImage): boolean {
  return image.width === null || image.height === null;
}

export function countUnknownDimensionPhotos(images: ListingValidationImage[]): number {
  return images.filter(hasUnknownDimension).length;
}

// Única fonte de verdade de "esta peça pode ser anunciada no Mercado Livre"
// (Fase 1A — só simulação, nenhuma publicação real ainda). Blockers impedem
// o anúncio; warnings são avisos para revisão manual, nunca bloqueiam.
export function validateListing(product: ListingValidationInput): ListingValidationResult {
  const blockers: ListingValidationIssue<ListingBlockerCode>[] = [];
  const warnings: ListingValidationIssue<ListingWarningCode>[] = [];

  if (!product.active) {
    blockers.push({ code: "inactive", message: "Peça está inativa (oculta do site) — não pode ser anunciada." });
  }
  if (product.trackStock && (product.stockQty ?? 0) <= 0) {
    blockers.push({ code: "out_of_stock", message: "Sem unidade em estoque." });
  }

  const title = resolveTitle(product, "pt");
  if (isPlaceholderTitle(title)) {
    blockers.push({
      code: "placeholder_title",
      message: `Nome ainda é provisório ("${title}") — cadastre um nome de catálogo antes de anunciar.`,
    });
  }

  const price = toNumberOrNull(product.price);
  if (price === null) {
    blockers.push({ code: "missing_price", message: "Peça sem preço cadastrado." });
  } else if (price <= PLACEHOLDER_PRICE_MAX) {
    blockers.push({
      code: "placeholder_price",
      message: `Preço provisório (R$ ${price.toFixed(2)}) — defina o preço real antes de anunciar.`,
    });
  }

  const weightGrams = toNumberOrNull(product.weightGrams) ?? 0;
  if (weightGrams <= 0) {
    blockers.push({ code: "missing_weight", message: "Peso não informado (0g) — obrigatório para calcular frete no Mercado Livre." });
  }

  const sizeCm = toNumberOrNull(product.sizeCm) ?? 0;
  if (sizeCm <= 0) {
    blockers.push({ code: "missing_size", message: "Tamanho não informado (0cm)." });
  }

  if (product.images.length === 0) {
    blockers.push({ code: "no_photos", message: "Peça sem nenhuma foto." });
  } else {
    // Só bloqueia quando a dimensão é CONHECIDA e abaixo do mínimo — dimensão
    // ausente (null, foto legado) nunca bloqueia, só gera aviso abaixo, para
    // não reprovar peças por falta de dado em vez de foto realmente pequena.
    const knownTooSmall = product.images.filter(
      (img) => !hasUnknownDimension(img) && ((img.width as number) < ML_MIN_PHOTO_PX || (img.height as number) < ML_MIN_PHOTO_PX)
    );
    if (knownTooSmall.length > 0) {
      blockers.push({
        code: "photo_too_small",
        message: `${knownTooSmall.length} foto(s) abaixo do mínimo exigido pelo Mercado Livre (${ML_MIN_PHOTO_PX}×${ML_MIN_PHOTO_PX}px).`,
      });
    }

    const unknownCount = countUnknownDimensionPhotos(product.images);
    if (unknownCount > 0) {
      warnings.push({
        code: "unknown_photo_dimension",
        message: `${unknownCount} foto(s) sem dimensão registrada (legado) — conferir manualmente se atende ao mínimo de ${ML_MIN_PHOTO_PX}×${ML_MIN_PHOTO_PX}px exigido pelo Mercado Livre.`,
      });
    }
  }

  // Não-bloqueante: as regras de imagem do Mercado Livre (logotipo, texto,
  // marca d'água na foto principal) variam por categoria e não foram
  // verificadas nesta fase (ver categoryFixture.ts) — fica como lembrete de
  // revisão humana sempre que houver pelo menos uma foto.
  if (product.images.length > 0) {
    warnings.push({
      code: "review_photo_branding",
      message:
        "Conferir manualmente: a foto principal não deve ter logotipo, texto ou marca d'água (regra varia por categoria no Mercado Livre e não foi verificada).",
    });
  }

  return { eligible: blockers.length === 0, blockers, warnings };
}
