// Mapeamento Category.slug -> google_product_category, usado só pelo feed de
// produtos (Google Merchant Center / Meta Catalog aceita o mesmo texto).
//
// `id` e `path` foram copiados VERBATIM do arquivo oficial da taxonomia do
// Google (baixado de
// https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
// em 2026-11-27, cabeçalho "Google_Product_Taxonomy_Version: 2021-09-21" —
// mesma versão da conferência anterior, nenhuma atualização do Google desde
// então) — NUNCA inventar um caminho que não exista literalmente nesse
// arquivo. Se o Google publicar uma versão mais nova, reconferir cada `path`
// abaixo contra o arquivo novo antes de atualizar (os IDs numéricos de
// categorias existentes raramente mudam, mas o texto do caminho pode).
//
// Reescrito em 2026-11-27 (auditoria de produção -> branch
// feat/feed-google-categorias): o Felipe recategorizou o catálogo e
// substituiu a árvore antiga inteira (big/formas/homedecor/acessorios) por
// 5 categorias novas (pedras-brutas/pedras-polidas inalteradas; capelas,
// obeliscos, esferas, esculturas e joias são as novas). A tabela
// `Subcategory` está vazia hoje — todo slug abaixo é de uma `Category` de
// nível 1, não há nível 2 para mapear.
//
// Categoria sem entrada no mapa (ou produto sem categoria) não recebe
// `google_product_category` no feed — campo é recomendado pelo Google, não
// obrigatório; omitir é mais seguro que categorizar errado.
export interface GoogleProductCategoryEntry {
  id: number;
  path: string;
}

export const GOOGLE_PRODUCT_CATEGORY_BY_CATEGORY_SLUG: Record<string, GoogleProductCategoryEntry> = {
  // Pedra solta/bruta, não lapidada em joia — categoria real e exata da
  // taxonomia (id 198), prática comum entre lojas de cristais/minerais.
  "pedras-brutas": {
    id: 198,
    path: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Embellishments & Trims > Loose Stones",
  },
  "pedras-polidas": {
    id: 198,
    path: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Embellishments & Trims > Loose Stones",
  },
  // Capelas/geodos e esferas não têm nó específico na taxonomia — caem no nó
  // genérico de decoração da casa (id 696), mesmo valor já usado antes para
  // "homedecor".
  capelas: {
    id: 696,
    path: "Home & Garden > Decor",
  },
  esferas: {
    id: 696,
    path: "Home & Garden > Decor",
  },
  // DIVERGÊNCIA confirmada com o usuário em 2026-11-27: o caminho pedido
  // ("Home & Garden > Decor > Sculptures & Statues") não existe literalmente
  // na taxonomia — o nó real de "Sculptures & Statues" tem "Artwork" no meio
  // (único nó com esse nome em toda a taxonomia). Usado o caminho real.
  obeliscos: {
    id: 11,
    path: "Home & Garden > Decor > Artwork > Sculptures & Statues",
  },
  esculturas: {
    id: 11,
    path: "Home & Garden > Decor > Artwork > Sculptures & Statues",
  },
  joias: {
    id: 188,
    path: "Apparel & Accessories > Jewelry",
  },
};
