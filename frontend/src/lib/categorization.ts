import type { BulkCategoryItem, Product } from "../types";

// Lógica pura da tela de categorização — sem React, testável isolada (mesmo
// princípio de lib/catalogProductPicker.ts/productOrder.ts). O estado de
// seleção vive como array de ids (convertido para Set só para a operação,
// nunca guardado como Set — arrays são mais simples de comparar em teste e
// de colocar em useState).

export function toggleSelection(selected: string[], id: string): string[] {
  const set = new Set(selected);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return [...set];
}

// Shift+clique: seleciona o intervalo [from, to] (em QUALQUER ordem) dentro
// da lista visível ATUAL (ordem de exibição na tela, não ordem de seleção) —
// soma ao que já estava selecionado, nunca substitui (consistente com
// selectAllMatching abaixo e com selectAllFiltered de catalogProductPicker.ts).
export function selectRange(selected: string[], visibleIds: string[], fromIndex: number, toIndex: number): string[] {
  const set = new Set(selected);
  const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
  for (let i = start; i <= end && i < visibleIds.length; i++) {
    if (i >= 0) set.add(visibleIds[i]);
  }
  return [...set];
}

// "Selecionar as N peças do filtro atual" — soma TODOS os ids (não só os já
// carregados na página atual) ao que já estava selecionado.
export function selectAllMatching(selected: string[], allMatchingIds: string[]): string[] {
  const set = new Set(selected);
  for (const id of allMatchingIds) set.add(id);
  return [...set];
}

export function deselectIds(selected: string[], idsToRemove: readonly string[]): string[] {
  const remove = new Set(idsToRemove);
  return selected.filter((id) => !remove.has(id));
}

// Decide quem se move ao soltar uma peça arrastada sobre um nó da árvore
// (ver DndContext em pages/ProductCategorization.tsx): se a peça arrastada
// JÁ estava selecionada, a seleção inteira vai junto; senão, só ela — sem
// alterar a seleção de quem não foi arrastado.
export function idsToMoveOnDrop(draggedId: string, selected: readonly string[]): string[] {
  return selected.includes(draggedId) ? [...selected] : [draggedId];
}

// Expande "mover as peças selecionadas para UM destino" no shape heterogêneo
// que a API realmente aceita (ver backend lib/bulkCategory.ts) — a API não
// tem um atalho "mesmo destino pra todas", o cliente monta a lista.
export function buildBulkMoveItems(ids: readonly string[], categoryId: string | null, subcategoryId: string | null): BulkCategoryItem[] {
  return ids.map((id) => ({ id, categoryId, subcategoryId }));
}

// Busca TODOS os ids (não só a página carregada) que casam com o filtro
// atual, paginando até o fim — mesmo princípio de fetchAllActiveProducts em
// catalogProductPicker.ts, só que parametrizado pelo filtro desta tela em
// vez de "todas as ativas". `pageSize` grande (o máximo aceito pelo backend,
// 100) minimiza o número de chamadas; ~200 peças reais cabem em 2 chamadas.
const SELECT_ALL_PAGE_SIZE = 100;
const SELECT_ALL_MAX_PAGES = 50; // trava de segurança, nunca deve ser atingida

export async function fetchAllMatchingProductIds(
  listProducts: (params: { page: number; pageSize: number }) => Promise<{ items: Product[]; total: number }>
): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page <= SELECT_ALL_MAX_PAGES; page++) {
    const res = await listProducts({ page, pageSize: SELECT_ALL_PAGE_SIZE });
    ids.push(...res.items.map((p) => p.id));
    if (res.items.length === 0 || ids.length >= res.total) break;
  }
  return ids;
}
