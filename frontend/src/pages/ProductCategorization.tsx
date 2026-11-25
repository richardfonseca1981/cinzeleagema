import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { api, ApiError, exportCategoryCsv } from "../lib/api";
import { useToast } from "../components/Toast";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Pagination } from "../components/Pagination";
import { totalPages } from "../lib/pagination";
import { coverImage } from "../lib/productRow";
import { formatAdminPrice, formatAdminSku } from "../lib/adminProductFormat";
import {
  buildBulkMoveItems,
  deselectIds,
  fetchAllMatchingProductIds,
  idsToMoveOnDrop,
  selectAllMatching,
  selectRange,
  toggleSelection,
} from "../lib/categorization";
import { CategoryTree, sameBrowseFilter, type BrowseFilter } from "../components/categorization/CategoryTree";
import { MoveToPicker, destinationDropId, flattenDestinations, type MoveDestination } from "../components/categorization/MoveToPicker";
import type { CategoryTree as CategoryTreeData, Product } from "../types";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

function filterToParams(filter: BrowseFilter): { categoryId?: string; subcategoryId?: string; uncategorized?: boolean } {
  if (filter.kind === "uncategorized") return { uncategorized: true };
  if (filter.kind === "category") return { categoryId: filter.categoryId };
  if (filter.kind === "subcategory") return { categoryId: filter.categoryId, subcategoryId: filter.subcategoryId };
  return {};
}

function filterLabel(filter: BrowseFilter, tree: CategoryTreeData | null): string {
  if (filter.kind === "uncategorized") return "Sem categoria";
  if (filter.kind === "all") return "Todas as peças";
  if (!tree) return "";
  const category = tree.categories.find((c) => c.id === filter.categoryId);
  if (filter.kind === "category") return category?.name ?? "";
  const sub = category?.subcategories.find((s) => s.id === filter.subcategoryId);
  return sub ? `${category?.name} > ${sub.name}` : "";
}

function currentCategoryLabel(product: Product): string {
  if (!product.category) return "Sem categoria";
  return product.subcategory ? `${product.category.name} > ${product.subcategory.name}` : product.category.name;
}

// Linha/card arrastável — cada peça precisa do PRÓPRIO hook useDraggable;
// como não dá pra chamar hook dentro de um .map() direto (regra dos hooks:
// contagem de chamadas tem que ser estável por INSTÂNCIA de componente), a
// peça vira um componente próprio em vez de só um bloco de JSX inline.
function TableRow({
  product,
  isSelected,
  onClick,
}: {
  product: Product;
  isSelected: boolean;
  onClick: (event: React.MouseEvent) => void;
}) {
  // Sem transform/estilo aplicado na linha em si — o visual de "sendo
  // arrastada" é todo do <DragOverlay> (portado pelo próprio @dnd-kit,
  // sempre acima de tudo); aqui só esmaece a linha de origem.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: product.id });
  const cover = coverImage(product);

  return (
    <tr
      ref={setNodeRef}
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={`cursor-pointer touch-none border-t border-[#E2E8F0] select-none ${
        isDragging ? "opacity-40" : isSelected ? "bg-[#C78F50]/10" : "hover:bg-[#F8FAFC]"
      }`}
    >
      <td className="px-3 py-2">
        <input type="checkbox" checked={isSelected} readOnly tabIndex={-1} className="pointer-events-none" />
      </td>
      <td className="px-3 py-2">
        {cover ? <img src={cover.url} alt="" className="h-10 w-8 rounded object-cover" /> : <div className="h-10 w-8 rounded bg-[#E2E8F0]" />}
      </td>
      <td className="px-3 py-2 text-[#1A1A1A]">{product.name || "(sem nome)"}</td>
      <td className="px-3 py-2 text-[#64748B]">{formatAdminSku(product.sku)}</td>
      <td className="px-3 py-2 text-[#1A1A1A]">{formatAdminPrice(product.price)}</td>
      <td className="px-3 py-2 text-[#64748B]">{currentCategoryLabel(product)}</td>
    </tr>
  );
}

function CardRow({
  product,
  isSelected,
  onClick,
}: {
  product: Product;
  isSelected: boolean;
  onClick: (event: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: product.id });
  const cover = coverImage(product);

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-3 rounded-lg border p-3 touch-none select-none ${
        isDragging ? "opacity-40" : isSelected ? "border-[#C78F50] bg-[#C78F50]/10" : "border-[#E2E8F0] bg-white"
      }`}
    >
      <input type="checkbox" checked={isSelected} readOnly tabIndex={-1} className="pointer-events-none" />
      {cover ? <img src={cover.url} alt="" className="h-12 w-9 shrink-0 rounded object-cover" /> : <div className="h-12 w-9 shrink-0 rounded bg-[#E2E8F0]" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#1A1A1A]">{product.name || "(sem nome)"}</p>
        <p className="truncate text-xs text-[#64748B]">
          {formatAdminSku(product.sku)} · {formatAdminPrice(product.price)}
        </p>
        <p className="truncate text-xs text-[#64748B]">{currentCategoryLabel(product)}</p>
      </div>
    </div>
  );
}

// Conteúdo do <DragOverlay> — quando mais de uma peça está sendo movida
// junto (a arrastada fazia parte da seleção), mostra "N peças" em vez da
// miniatura de uma só, pra não sugerir que só aquela vai mudar.
function DragPreview({ product, count }: { product: Product | undefined; count: number }) {
  if (count > 1) {
    return (
      <div className="rounded-lg border border-[#C78F50] bg-white px-4 py-2 text-sm font-semibold text-[#1A1A1A] shadow-xl">
        {count} peças
      </div>
    );
  }
  if (!product) return null;
  const cover = coverImage(product);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#C78F50] bg-white px-3 py-2 shadow-xl">
      {cover ? <img src={cover.url} alt="" className="h-10 w-8 rounded object-cover" /> : <div className="h-10 w-8 rounded bg-[#E2E8F0]" />}
      <span className="max-w-[160px] truncate text-sm font-medium text-[#1A1A1A]">{product.name || "(sem nome)"}</span>
    </div>
  );
}

export function ProductCategorization() {
  const { showToast } = useToast();

  const [tree, setTree] = useState<CategoryTreeData | null>(null);
  const [treeError, setTreeError] = useState(false);
  const [filter, setFilter] = useState<BrowseFilter>({ kind: "uncategorized" });

  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Product[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [selected, setSelected] = useState<string[]>([]);
  const lastClickedIndexRef = useRef<number | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);

  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const moveButtonRef = useRef<HTMLButtonElement>(null);
  const [moving, setMoving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const generationRef = useRef(0);

  const reloadTree = useCallback(() => {
    api
      .getCategoryTree()
      .then((res) => {
        setTree(res);
        setTreeError(false);
      })
      .catch(() => setTreeError(true));
  }, []);

  useEffect(reloadTree, [reloadTree]);

  const loadProducts = useCallback(() => {
    const generation = ++generationRef.current;
    setLoading(true);
    setLoadError(false);

    api
      .listProducts({ ...filterToParams(filter), q: search || undefined, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (generationRef.current !== generation) return;
        setData({ items: res.items, total: res.total });
      })
      .catch(() => {
        if (generationRef.current !== generation) return;
        setLoadError(true);
      })
      .finally(() => {
        if (generationRef.current !== generation) return;
        setLoading(false);
      });
  }, [filter, search, page]);

  useEffect(loadProducts, [loadProducts]);

  // Debounce da busca — mesmo padrão de ProductList.tsx (300ms, não dispara a
  // cada tecla).
  useEffect(() => {
    const term = searchDraft.trim();
    if (term === search) return;
    const timer = setTimeout(() => setSearch(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft, search]);

  function handleSelectFilter(next: BrowseFilter) {
    if (sameBrowseFilter(next, filter)) return;
    setFilter(next);
    setPage(1);
    setSelected([]);
    lastClickedIndexRef.current = null;
  }

  function handleSearchChange(value: string) {
    setSearchDraft(value);
    setPage(1);
    setSelected([]);
  }

  // Clique: alterna a peça. Shift+clique: seleciona o intervalo desde o
  // último clique, dentro da página visível atual — NUNCA perde a seleção
  // já feita em outras páginas (estado vive fora da lista renderizada).
  function handleRowClick(index: number, id: string, event: React.MouseEvent) {
    const visibleIds = data?.items.map((p) => p.id) ?? [];
    if (event.shiftKey && lastClickedIndexRef.current !== null) {
      setSelected((prev) => selectRange(prev, visibleIds, lastClickedIndexRef.current!, index));
    } else {
      setSelected((prev) => toggleSelection(prev, id));
    }
    lastClickedIndexRef.current = index;
  }

  async function handleSelectAllMatching() {
    if (!data) return;
    setSelectingAll(true);
    try {
      const ids = await fetchAllMatchingProductIds((params) =>
        api.listProducts({ ...filterToParams(filter), q: search || undefined, ...params })
      );
      setSelected((prev) => selectAllMatching(prev, ids));
    } catch {
      showToast("error", "Não foi possível selecionar todas as peças do filtro.");
    } finally {
      setSelectingAll(false);
    }
  }

  function handleClearSelection() {
    setSelected([]);
    lastClickedIndexRef.current = null;
  }

  async function handleUndo() {
    try {
      const result = await api.undoBulkCategory();
      showToast("success", `Desfeito: ${result.updated} peça(s) restaurada(s).`);
      reloadTree();
      loadProducts();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível desfazer");
    }
  }

// Único caminho que de fato move peças — usado tanto pelo botão "Mover
  // para..." (destino escolhido no MoveToPicker, ids = seleção atual) quanto
  // pelo soltar na árvore (destino = nó onde soltou, ids = a peça arrastada
  // OU, se ela já estava selecionada, a seleção inteira — ver handleDragEnd).
  async function moveItems(ids: string[], destination: MoveDestination) {
    if (ids.length === 0) return;
    setMoving(true);
    try {
      const result = await api.bulkMoveCategory(buildBulkMoveItems(ids, destination.categoryId, destination.subcategoryId));
      showToast("success", `${result.updated} peça(s) movida(s) para "${destination.label}".`, { label: "Desfazer", onClick: handleUndo });
      setSelected((prev) => deselectIds(prev, ids));
      reloadTree();
      loadProducts();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível mover as peças");
    } finally {
      setMoving(false);
    }
  }

  function handleMovePickerSelect(destination: MoveDestination) {
    setMovePickerOpen(false);
    moveItems(selected, destination);
  }

  const destinationsByDropId = useMemo(() => {
    const map = new Map<string, MoveDestination>();
    if (tree) for (const destination of flattenDestinations(tree)) map.set(destinationDropId(destination), destination);
    return map;
  }, [tree]);

  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Id da peça sendo arrastada agora — alimenta o <DragOverlay> abaixo (o
  // visual "flutuante" de arrastar, sempre por cima de tudo) e o indicador
  // "N peças" quando a seleção inteira está sendo movida.
  const [activeId, setActiveId] = useState<string | null>(null);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  // Arrastar uma peça JÁ selecionada move a seleção inteira; arrastar uma
  // peça fora da seleção move só ela (não altera o que estava selecionado).
  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const destination = destinationsByDropId.get(String(over.id));
    if (!destination) return;
    moveItems(idsToMoveOnDrop(String(active.id), selected), destination);
  }

  const draggedIds = activeId ? idsToMoveOnDrop(activeId, selected) : [];
  const draggedProduct = activeId ? data?.items.find((p) => p.id === activeId) : undefined;

  const [pendingDelete, setPendingDelete] = useState<{ kind: "category" | "subcategory"; id: string; name: string; productCount: number } | null>(
    null
  );

  function detailsProductCount(err: unknown): number {
    if (err instanceof ApiError && err.details && typeof err.details === "object") {
      const count = (err.details as { productCount?: unknown }).productCount;
      if (typeof count === "number") return count;
    }
    return 0;
  }

  async function handleCreateCategory(name: string) {
    try {
      await api.createCategory(name);
      reloadTree();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível criar a categoria");
    }
  }

  async function handleRenameCategory(id: string, name: string) {
    try {
      await api.renameCategory(id, name);
      reloadTree();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível renomear a categoria");
    }
  }

  async function handleDeleteCategory(id: string) {
    const name = tree?.categories.find((c) => c.id === id)?.name ?? "esta categoria";
    try {
      await api.deleteCategory(id);
      showToast("success", "Categoria apagada.");
      reloadTree();
      loadProducts();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setPendingDelete({ kind: "category", id, name, productCount: detailsProductCount(err) });
        return;
      }
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível apagar a categoria");
    }
  }

  async function handleCreateSubcategory(categoryId: string, name: string) {
    try {
      await api.createSubcategory(categoryId, name);
      reloadTree();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível criar a subcategoria");
    }
  }

  async function handleRenameSubcategory(id: string, name: string) {
    try {
      await api.renameSubcategory(id, name);
      reloadTree();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível renomear a subcategoria");
    }
  }

  async function handleDeleteSubcategory(id: string) {
    const name = tree?.categories.flatMap((c) => c.subcategories).find((s) => s.id === id)?.name ?? "esta subcategoria";
    try {
      await api.deleteSubcategory(id);
      showToast("success", "Subcategoria apagada.");
      reloadTree();
      loadProducts();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setPendingDelete({ kind: "subcategory", id, name, productCount: detailsProductCount(err) });
        return;
      }
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível apagar a subcategoria");
    }
  }

  async function confirmPendingDelete() {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    setPendingDelete(null);
    try {
      if (kind === "category") await api.deleteCategory(id, true);
      else await api.deleteSubcategory(id, true);
      showToast("success", "Apagada — peças movidas para Sem categoria.");
      reloadTree();
      loadProducts();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível apagar");
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { blob, filename } = await exportCategoryCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível exportar o backup");
    } finally {
      setExporting(false);
    }
  }

  const pages = data ? totalPages(data.total, PAGE_SIZE) : 1;
  const hasSelection = selected.length > 0;
  const allMatchingSelected = Boolean(data) && data!.total > 0 && selected.length >= data!.total;

  return (
    <DndContext
      sensors={dragSensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
    <div className="pb-24 sm:pb-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[#1A1A1A]">Categorização de peças</h1>
          <p className="text-sm text-[#64748B]">Mova peças entre categorias e subcategorias em lote. Exporte um backup antes de mudanças grandes.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm hover:bg-white disabled:opacity-50"
          >
            {exporting ? "Exportando..." : "Exportar backup (CSV)"}
          </button>
          <Link to="/admin/produtos" className="text-sm font-medium text-[#5F84BA] hover:underline">
            ← Voltar aos produtos
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <aside className="rounded-xl border border-[#E2E8F0] bg-white p-3">
          {treeError && <p className="text-sm text-[#B91C1C]">Não foi possível carregar as categorias.</p>}
          {tree && (
            <CategoryTree
              tree={tree}
              activeFilter={filter}
              onSelectFilter={handleSelectFilter}
              actions={{
                onCreateCategory: handleCreateCategory,
                onRenameCategory: handleRenameCategory,
                onDeleteCategory: handleDeleteCategory,
                onCreateSubcategory: handleCreateSubcategory,
                onRenameSubcategory: handleRenameSubcategory,
                onDeleteSubcategory: handleDeleteSubcategory,
              }}
            />
          )}
        </aside>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={searchDraft}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar por nome ou SKU..."
              aria-label="Buscar peça"
              className="min-w-[200px] flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
            />
            <span className="text-sm text-[#64748B]">{filterLabel(filter, tree)}</span>
          </div>

          {data && data.total > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              {!allMatchingSelected ? (
                <button type="button" onClick={handleSelectAllMatching} disabled={selectingAll} className="font-medium text-[#5F84BA] hover:underline disabled:opacity-50">
                  {selectingAll ? "Selecionando..." : `Selecionar as ${data.total} peça(s) deste filtro`}
                </button>
              ) : (
                <span className="text-[#64748B]">Todas as {data.total} peça(s) deste filtro estão selecionadas.</span>
              )}
            </div>
          )}

          {loadError && (
            <div role="alert" className="mb-3 rounded-lg border border-[#EF4444] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
              Não foi possível carregar as peças.
            </div>
          )}

          {/* ≥640px: tabela */}
          <div className="hidden overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] text-left text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                <tr>
                  <th className="w-10 px-3 py-2"></th>
                  <th className="px-3 py-2">Foto</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Preço</th>
                  <th className="px-3 py-2">Categoria atual</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-[#64748B]">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!loading && !loadError && data?.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[#64748B]">
                      Nenhuma peça neste filtro.
                    </td>
                  </tr>
                )}
                {data?.items.map((product, index) => (
                  <TableRow
                    key={product.id}
                    product={product}
                    isSelected={selected.includes(product.id)}
                    onClick={(e) => handleRowClick(index, product.id, e)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* <640px: cards */}
          <div className="space-y-2 sm:hidden">
            {loading && !data && <p className="py-6 text-center text-sm text-[#64748B]">Carregando...</p>}
            {!loading && !loadError && data?.items.length === 0 && <p className="py-10 text-center text-sm text-[#64748B]">Nenhuma peça neste filtro.</p>}
            {data?.items.map((product, index) => (
              <CardRow
                key={product.id}
                product={product}
                isSelected={selected.includes(product.id)}
                onClick={(e) => handleRowClick(index, product.id, e)}
              />
            ))}
          </div>

          <div className="mt-4">
            <Pagination page={page} pages={pages} onChange={setPage} disabled={loading} />
          </div>
        </section>
      </div>

      {/* Barra de ação: fixa no rodapé no celular (acréscimo C), inline no computador. */}
      {hasSelection && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-[#E2E8F0] bg-white px-4 py-3 shadow-lg sm:sticky sm:bottom-4 sm:mt-4 sm:rounded-xl sm:border sm:shadow-md">
          <span className="text-sm font-medium text-[#1A1A1A]">{selected.length} selecionada(s)</span>
          <div className="relative flex items-center gap-2">
            <button type="button" onClick={handleClearSelection} className="text-sm text-[#64748B] hover:underline">
              Limpar
            </button>
            <button
              ref={moveButtonRef}
              type="button"
              onClick={() => setMovePickerOpen((v) => !v)}
              disabled={moving}
              className="rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-medium text-[#010B1A] hover:bg-[#B37D3F] disabled:opacity-50"
            >
              {moving ? "Movendo..." : "Mover para..."}
            </button>
            {movePickerOpen && tree && (
              <MoveToPicker tree={tree} anchorRef={moveButtonRef} onSelect={handleMovePickerSelect} onClose={() => setMovePickerOpen(false)} />
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Apagar ${pendingDelete?.kind === "category" ? "categoria" : "subcategoria"}`}
        message={
          pendingDelete?.kind === "category"
            ? `"${pendingDelete.name}" tem ${pendingDelete.productCount} peça(s). Confirmar move todas para "Sem categoria" e apaga a categoria.`
            : `"${pendingDelete?.name}" tem ${pendingDelete?.productCount} peça(s). Confirmar remove a subcategoria delas (a categoria continua) e apaga a subcategoria.`
        }
        confirmLabel="Apagar mesmo assim"
        onConfirm={confirmPendingDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
    <DragOverlay>{activeId ? <DragPreview product={draggedProduct} count={draggedIds.length} /> : null}</DragOverlay>
    </DndContext>
  );
}
