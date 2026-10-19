// Busca de peças por nome/SKU (parâmetro "q" de GET /api/products, usado
// tanto pelo catálogo público quanto pela lista do admin) — comparação em
// memória, sem extensão `unaccent` do Postgres (decisão de escopo, ver
// CONTEXT.md). O caller busca só {id, name, nameEn, sku} das peças que já
// passam nos demais filtros (active/categoryId/subcategoryId) e usa
// `filterProductIdsBySearch` para decidir quais ids entram no `id: { in }`
// da consulta principal — paginação, total e ordenação continuam vindo do
// Prisma normalmente.

const DIACRITIC_MARKS = new RegExp("[̀-ͯ]", "g");

// NFD decompõe "á" em "a" + acento combinável (U+0300-U+036F); removendo os
// combináveis sobra o caractere base sem diacrítico. Hífen vira espaço para
// "água-marinha" e "agua marinha" caírem na mesma palavra.
function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITIC_MARKS, "")
    .replace(/-/g, " ")
    .toLowerCase()
    .trim();
}

// Divide o termo buscado em palavras — cada uma precisa aparecer em algum
// campo da peça (ver productMatchesSearch), em qualquer ordem.
export function splitSearchWords(q: string): string[] {
  return normalizeSearchText(q)
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

export interface SearchableProduct {
  id: string;
  name?: string | null;
  nameEn?: string | null;
  sku?: string | null;
}

// Uma peça casa com a busca quando TODAS as palavras aparecem em ALGUM dos
// três campos (não precisa ser o mesmo campo para todas). "%", "_" e "\" são
// texto literal aqui — é "includes" de string comum, sem LIKE/ILIKE do banco.
export function productMatchesSearch(product: SearchableProduct, words: string[]): boolean {
  if (words.length === 0) return true;

  const haystacks = [product.name, product.nameEn, product.sku]
    .filter((value): value is string => Boolean(value))
    .map(normalizeSearchText);

  return words.every((word) => haystacks.some((haystack) => haystack.includes(word)));
}

// q vazio/só espaços devolve todos os ids (equivalente a "sem busca") — o
// caller só chama isto quando "q" já passou pela validação do Zod.
export function filterProductIdsBySearch(products: SearchableProduct[], q: string): string[] {
  const words = splitSearchWords(q);
  return products.filter((product) => productMatchesSearch(product, words)).map((product) => product.id);
}
