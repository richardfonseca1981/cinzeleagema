// Paginação numerada — funções puras (sem React), testáveis isoladamente.

// Itens por página oferecidos no admin. O máximo espelha o limite do backend
// (GET /api/products: pageSize ≤ 100).
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export type PageItem = number | "ellipsis-start" | "ellipsis-end";

export function totalPages(total: number, pageSize: number): number {
  if (!(total > 0) || !(pageSize > 0)) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

// Mantém a página dentro de 1..pages (valores inválidos viram 1).
export function clampPage(page: number, pages: number): number {
  const safePages = Number.isFinite(pages) && pages >= 1 ? Math.floor(pages) : 1;
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(Math.floor(page), 1), safePages);
}

// Números de página com reticências: sempre a primeira, a última e a atual
// com uma vizinha de cada lado. Com mais de 7 páginas o resultado tem sempre
// 7 itens (a largura da barra não "pula" ao navegar).
export function getPageItems(current: number, pages: number): PageItem[] {
  const last = Math.max(1, Math.floor(pages));
  const page = clampPage(current, last);

  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "ellipsis-end", last];
  if (page >= last - 3) return [1, "ellipsis-start", last - 4, last - 3, last - 2, last - 1, last];
  return [1, "ellipsis-start", page - 1, page, page + 1, "ellipsis-end", last];
}

// "Mostrando 1–50 de 76 produtos"
export function rangeText(page: number, pageSize: number, total: number): string {
  if (!(total > 0)) return "Nenhum produto";
  const current = clampPage(page, totalPages(total, pageSize));
  const start = (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  return `Mostrando ${start}–${end} de ${total} produto${total === 1 ? "" : "s"}`;
}
