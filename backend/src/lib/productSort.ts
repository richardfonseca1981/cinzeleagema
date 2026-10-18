import { Prisma } from "@prisma/client";

// Valores aceitos em GET /api/products?sort=... (catálogo público). "default"
// é a ordem definida pelo admin (arrastar na lista) — ver lib/productOrder no
// frontend admin. Qualquer valor fora desta lista é 400 (ver product.schema.ts).
export const SORT_VALUES = [
  "default",
  "newest",
  "price_asc",
  "price_desc",
  "size_desc",
  "size_asc",
  "weight_desc",
  "weight_asc",
] as const;

export type ProductSort = (typeof SORT_VALUES)[number];

// Desempate estável em TODAS as ordenações: duas peças com o mesmo valor do
// campo ordenado (ou createdAt igual, ex: seed em lote) precisam de uma ordem
// determinística entre si, senão a mesma peça pode pular ou repetir ao virar
// a página (ver productPagination.test.ts, mesmo raciocínio já aplicado ao
// "default").
export const DEFAULT_ORDER_BY: Prisma.ProductOrderByWithRelationInput[] = [{ sortOrder: "asc" }, { id: "asc" }];

// Ordenações que uma única consulta Prisma resolve. size_asc/weight_asc ficam
// de fora (ver splitWindow abaixo): sizeCm/weightGrams usam 0 como sentinel de
// "não informado" (não null, diferente de price), e esse 0 precisa ficar no
// FIM mesmo no crescente — o que o Prisma não faz nativamente para campo
// numérico comum (só `price` tem `nulls: "last"` por ser Decimal nullable).
export type SimpleSort = Exclude<ProductSort, "size_asc" | "weight_asc">;

const SIMPLE_ORDER_BY: Record<SimpleSort, Prisma.ProductOrderByWithRelationInput[]> = {
  default: DEFAULT_ORDER_BY,
  newest: [{ createdAt: "desc" }, ...DEFAULT_ORDER_BY],
  // Preço null ("Consulte o valor") sempre no fim, nos dois sentidos — preço
  // 0 é preço real e entra na ordenação normalmente.
  price_asc: [{ price: { sort: "asc", nulls: "last" } }, ...DEFAULT_ORDER_BY],
  price_desc: [{ price: { sort: "desc", nulls: "last" } }, ...DEFAULT_ORDER_BY],
  // Descendente simples: 0 ("não informado") é o menor valor possível, então
  // já cai naturalmente no fim sem precisar de split.
  size_desc: [{ sizeCm: "desc" }, ...DEFAULT_ORDER_BY],
  weight_desc: [{ weightGrams: "desc" }, ...DEFAULT_ORDER_BY],
};

export function isSplitSort(sort: ProductSort): sort is "size_asc" | "weight_asc" {
  return sort === "size_asc" || sort === "weight_asc";
}

export function buildOrderBy(sort: SimpleSort): Prisma.ProductOrderByWithRelationInput[] {
  return SIMPLE_ORDER_BY[sort];
}

export function splitField(sort: "size_asc" | "weight_asc"): "sizeCm" | "weightGrams" {
  return sort === "size_asc" ? "sizeCm" : "weightGrams";
}

export function splitOrderBy(field: "sizeCm" | "weightGrams"): Prisma.ProductOrderByWithRelationInput[] {
  return [{ [field]: "asc" }, ...DEFAULT_ORDER_BY];
}

// Função pura: dado um "where" dividido em dois conjuntos concatenados (peças
// informadas, ordenadas pelo campo asc, seguidas das não informadas na ordem
// padrão), calcula a janela [skip, skip+take) de cada conjunto sem pular nem
// repetir peças na fronteira entre eles.
//
// Pensando em índice global: o primeiro conjunto ocupa [0, firstCount) e o
// segundo ocupa [firstCount, +infinito), com índice local = índice global -
// firstCount. Interseção de [skip, skip+take) com cada faixa dá a janela.
export function splitWindow(
  skip: number,
  take: number,
  firstCount: number
): { firstSkip: number; firstTake: number; secondSkip: number; secondTake: number } {
  const firstSkip = Math.min(skip, firstCount);
  const firstEnd = Math.min(skip + take, firstCount);
  const firstTake = Math.max(firstEnd - firstSkip, 0);

  const secondSkip = Math.max(skip - firstCount, 0);
  const secondEnd = Math.max(skip + take - firstCount, 0);
  const secondTake = Math.max(secondEnd - secondSkip, 0);

  return { firstSkip, firstTake, secondSkip, secondTake };
}
