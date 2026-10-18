// Mesmos valores aceitos por GET /api/products?sort= (ver backend
// lib/productSort.ts) — mantidos em sincronia manualmente, já que frontend e
// backend não compartilham tipos.
export const CATALOG_SORTS = [
  "default",
  "newest",
  "price_asc",
  "price_desc",
  "size_desc",
  "size_asc",
  "weight_desc",
  "weight_asc",
] as const;

export type CatalogSort = (typeof CATALOG_SORTS)[number];

// Lê o parâmetro "ordem" da URL — qualquer valor fora da lista (ausente,
// digitado à mão, de uma versão antiga da página) cai em "default" em vez de
// quebrar a página ou mandar um valor inválido ao backend (que responderia 400).
export function parseCatalogSort(value: string | null): CatalogSort {
  return (CATALOG_SORTS as readonly string[]).includes(value ?? "") ? (value as CatalogSort) : "default";
}
