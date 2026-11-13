import { resolveTitle, isPlaceholderTitle, type CatalogProductContent } from "./catalog/content";
import { PLACEHOLDER_PRICE_MAX } from "./catalog/generateCatalogPdf";

// Mesma peça que entra no catálogo em PDF (ver generateCatalogPdf.ts) é a
// fonte de verdade de "placeholder" — este tipo é o subconjunto de campos
// que essa regra precisa, direto do Prisma (sem include de imagens/categoria).
export interface SitemapEligibilityInput extends CatalogProductContent {
  id: string;
  price: unknown; // Decimal do Prisma ou já convertido — normalizado abaixo.
  active: boolean;
  trackStock: boolean;
  stockQty: number | null;
}

// Única fonte de verdade de "a peça pode entrar no sitemap/JSON-LD público":
// - inativa (`active=false`, admin escondeu a peça) nunca entra;
// - peça com controle de estoque e sem unidade disponível (stockQty<=0)
//   nunca entra — ela ainda existe no catálogo interno, mas não deve ser
//   oferecida a quem chega pelo Google;
// - nome provisório de importação em lote ("Pedra 1234 - Peso") OU preço
//   provisório (<= R$ 1,00) — MESMA regra do catálogo em PDF
//   (generateCatalogPdf.ts), reaproveitada aqui de propósito para não ter
//   duas definições de "placeholder" divergindo com o tempo.
export function isEligibleForSitemap(product: SitemapEligibilityInput): boolean {
  if (!product.active) return false;
  if (product.trackStock && (product.stockQty ?? 0) <= 0) return false;

  const title = resolveTitle(product, "pt");
  if (isPlaceholderTitle(title)) return false;

  const price = product.price === null || product.price === undefined ? null : Number(product.price);
  if (price !== null && price <= PLACEHOLDER_PRICE_MAX) return false;

  return true;
}
