// Mapeamento Category.slug -> google_product_category, usado só pelo feed de
// produtos (Google Merchant Center / Meta Catalog aceita o mesmo texto).
//
// `id` e `path` foram copiados VERBATIM do arquivo oficial da taxonomia do
// Google (baixado de
// https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
// em 2026-11-25, cabeçalho "Google_Product_Taxonomy_Version: 2021-09-21") —
// NUNCA inventar um caminho que não exista literalmente nesse arquivo. Se o
// Google publicar uma versão mais nova, reconferir cada `path` abaixo contra
// o arquivo novo antes de atualizar (os IDs numéricos de categorias
// existentes raramente mudam, mas o texto do caminho pode).
//
// `pending: true` marca um valor PROVISÓRIO/conservador que ainda precisa
// ser validado com o Felipe (ver CONTEXT.md "Feed de produtos") — hoje não
// se sabe com certeza o que entra de fato em "Homedecor"/"Acessorios" no
// catálogo (esferas? pingentes? objetos maiores?). Produto sem categoria, ou
// com categoria sem entrada neste mapa, simplesmente não recebe
// `google_product_category` no feed — campo é recomendado pelo Google, não
// obrigatório, e omitir é mais seguro do que categorizar errado.
export interface GoogleProductCategoryEntry {
  id: number;
  path: string;
  pending: boolean;
}

export const GOOGLE_PRODUCT_CATEGORY_BY_CATEGORY_SLUG: Record<string, GoogleProductCategoryEntry> = {
  // Pedra solta/bruta, não lapidada em joia — categoria real e exata da
  // taxonomia (id 198), prática comum entre lojas de cristais/minerais.
  "pedras-brutas": {
    id: 198,
    path: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Embellishments & Trims > Loose Stones",
    pending: false,
  },
  "pedras-polidas": {
    id: 198,
    path: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Embellishments & Trims > Loose Stones",
    pending: false,
  },
  big: {
    id: 198,
    path: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Embellishments & Trims > Loose Stones",
    pending: false,
  },
  formas: {
    id: 198,
    path: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Embellishments & Trims > Loose Stones",
    pending: false,
  },
  // PENDENTE (ver comentário geral acima): valor conservador = nó genérico
  // de decoração da casa, não um item específico.
  homedecor: {
    id: 696,
    path: "Home & Garden > Decor",
    pending: true,
  },
  // PENDENTE (ver comentário geral acima): valor conservador = raiz
  // "Apparel & Accessories", a trocar por um nó específico (ex.: joia de
  // verdade vs. bijuteria com pedra) quando Felipe confirmar o conteúdo real.
  acessorios: {
    id: 166,
    path: "Apparel & Accessories",
    pending: true,
  },
};
