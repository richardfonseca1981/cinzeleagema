import type { Product } from "../types";

// GET /api/products aceita no máx. pageSize=100 (ver listProductsQuerySchema
// no backend) — o seletor de peças do catálogo busca TODAS as peças ativas
// uma vez (dataset pequeno, dezenas/poucas centenas de peças únicas — ver
// CONTEXT do negócio) para filtrar/buscar no cliente, sem paginação na tela.
const PAGE_SIZE = 100;
// Trava de segurança (nunca deve ser atingida na prática) para não entrar
// num loop infinito se a API devolver algo inconsistente.
const MAX_PAGES = 50;

export async function fetchAllActiveProducts(
  listProducts: (params: { active: boolean; page: number; pageSize: number }) => Promise<{ items: Product[]; total: number }>
): Promise<Product[]> {
  const all: Product[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await listProducts({ active: true, page, pageSize: PAGE_SIZE });
    all.push(...res.items);
    if (res.items.length === 0 || all.length >= res.total) break;
  }
  return all;
}

export function filterPickerProducts(products: Product[], opts: { search: string; categoryId: string }): Product[] {
  const q = opts.search.trim().toLowerCase();
  return products.filter((product) => {
    if (opts.categoryId && product.categoryId !== opts.categoryId) return false;
    if (!q) return true;
    const name = (product.name ?? "").toLowerCase();
    const sku = (product.sku ?? "").toLowerCase();
    return name.includes(q) || sku.includes(q);
  });
}

export function toggleSelectedId(current: string[], id: string): string[] {
  const set = new Set(current);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return [...set];
}

// "Selecionar todas" seleciona as peças que passam no filtro/busca ATUAL,
// somando ao que já estava selecionado (não substitui) — trocar o filtro
// depois não desmarca o que já foi escolhido.
export function selectAllFiltered(current: string[], filtered: Product[]): string[] {
  const set = new Set(current);
  for (const product of filtered) set.add(product.id);
  return [...set];
}
