import { resolveTitle, isPlaceholderTitle, type CatalogProductContent } from "../catalog/content";
import { PLACEHOLDER_PRICE_MAX } from "../catalog/generateCatalogPdf";

// Mesmos campos exigidos por SitemapEligibilityInput + imagens (o sitemap não
// precisa saber se a peça tem foto; o feed de produtos precisa).
export interface FeedEligibilityInput extends CatalogProductContent {
  id: string;
  price: unknown; // Decimal do Prisma ou já convertido — normalizado abaixo.
  active: boolean;
  trackStock: boolean;
  stockQty: number | null;
  images: { url: string }[];
}

export type FeedExclusionReason = "inactive" | "out_of_stock" | "placeholder_title" | "missing_price" | "missing_image";

export interface FeedEligibilityResult {
  eligible: boolean;
  reason: FeedExclusionReason | null;
}

// Regra de "a peça pode entrar no feed de produtos (Google Merchant/Meta
// Catalog)" — DECISÃO (ver CONTEXT.md "Feed de produtos"): hoje não existe
// `Product.soldAt` na main (vive só na branch `feat/mercadolivre-integracao`,
// bloqueada esperando o cadastro do cliente no Mercado Pago/Mercado Livre,
// ver docs/RUNBOOK_MERCADOLIVRE.md nessa branch). Por decisão explícita,
// "peça vendida" aqui usa a MESMA proxy do sitemap (`sitemapEligibility.ts`):
// `active=false` (admin desativou) ou `trackStock` com `stockQty<=0`.
//
// Mais restritiva que `isEligibleForSitemap` em dois pontos, porque o feed
// exige dados que o sitemap não exige:
// - preço: o sitemap aceita `price === null` ("Consulte o valor"), mas o
//   Google exige <g:price> em toda peça — aqui preço null OU provisório
//   (<= R$ 1,00, mesma constante do catálogo em PDF) exclui a peça;
// - foto: o Google exige <g:image_link> — peça sem nenhuma foto exclui.
//
// "nome placeholder" aqui também cobre peça SEM NOME (cai para SKU ou "Peça
// sem nome" em resolveTitle) — decisão explícita de excluir do feed, mais
// estrita que o sitemap (que aceita peça sem nome, pois lá "Peça sem nome"
// ainda é uma página válida para o Google indexar).
//
// Ordem de verificação = ordem de prioridade do motivo reportado (ver
// scripts/auditProductFeed.ts): uma peça inativa E sem foto é contada só
// como "inactive".
export function evaluateFeedEligibility(product: FeedEligibilityInput): FeedEligibilityResult {
  if (!product.active) return { eligible: false, reason: "inactive" };
  if (product.trackStock && (product.stockQty ?? 0) <= 0) return { eligible: false, reason: "out_of_stock" };

  if (!product.name?.trim()) return { eligible: false, reason: "placeholder_title" };
  const title = resolveTitle(product, "pt");
  if (isPlaceholderTitle(title)) return { eligible: false, reason: "placeholder_title" };

  const price = product.price === null || product.price === undefined ? null : Number(product.price);
  if (price === null || price <= PLACEHOLDER_PRICE_MAX) return { eligible: false, reason: "missing_price" };

  if (product.images.length === 0) return { eligible: false, reason: "missing_image" };

  return { eligible: true, reason: null };
}

export function isEligibleForFeed(product: FeedEligibilityInput): boolean {
  return evaluateFeedEligibility(product).eligible;
}
