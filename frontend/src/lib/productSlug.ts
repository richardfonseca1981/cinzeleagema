// Mesmo algoritmo do backend (backend/src/lib/publicSlug.ts) — duplicado de
// propósito, como já é a convenção neste repo para o slugify de cadastro
// (ver backend/src/lib/productSlug.ts). Usado só para MONTAR o link do
// produto no catálogo/card; a página de produto (ProductDetail) nunca
// confia no slug que ela mesma calculou para decidir o que mostrar — ela
// sempre pergunta ao backend (GET /api/products/by-slug/:slugComId) e
// redireciona para o `canonicalSlug` que ele devolve, então um eventual
// desalinhamento entre as duas cópias do algoritmo nunca quebra a navegação,
// só faria o link do card apontar para uma URL que redireciona na hora.
const DIACRITICS_REGEX = /[̀-ͯ]/g;

export const SLUG_SUFFIX_LENGTH = 6;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function idSuffix(id: string, length: number = SLUG_SUFFIX_LENGTH): string {
  return id.slice(-length).toLowerCase();
}

export function buildPublicProductSlug(name: string | null | undefined, id: string): string {
  const base = slugify((name ?? "").trim()) || "peca";
  return `${base}-${idSuffix(id)}`;
}
