import type { Product } from "../types";

// Junta uma nova página de produtos à lista já carregada, sem duplicar (por
// id). A ordenação determinística do backend (createdAt desc, id como
// desempate) garante que isso nunca pula nem repete peças entre páginas —
// o filtro por id aqui é só uma segunda camada de defesa.
export function mergeProductPages(existing: Product[], newItems: Product[]): Product[] {
  const existingIds = new Set(existing.map((p) => p.id));
  const uniqueNewItems = newItems.filter((p) => !existingIds.has(p.id));
  return [...existing, ...uniqueNewItems];
}

// Há mais páginas para carregar enquanto a quantidade já exibida for menor
// que o total reportado pelo backend.
export function hasMorePages(loadedCount: number, total: number): boolean {
  return loadedCount < total;
}
