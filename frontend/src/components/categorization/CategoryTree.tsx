import { useDroppable } from "@dnd-kit/core";
import type { CategoryTree } from "../../types";
import { destinationDropId } from "./MoveToPicker";

// Filtro de navegação da fila (clicar num nó da árvore = ver as peças
// daquele grupo na grade) — diferente do DESTINO de "Mover para…"
// (MoveToPicker.tsx), que é outro seletor. "uncategorized" é a visão
// PADRÃO da tela (ver pages/ProductCategorization.tsx).
export type BrowseFilter =
  | { kind: "uncategorized" }
  | { kind: "all" }
  | { kind: "category"; categoryId: string }
  | { kind: "subcategory"; categoryId: string; subcategoryId: string };

export function sameBrowseFilter(a: BrowseFilter, b: BrowseFilter): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "category" && b.kind === "category") return a.categoryId === b.categoryId;
  if (a.kind === "subcategory" && b.kind === "subcategory") return a.categoryId === b.categoryId && a.subcategoryId === b.subcategoryId;
  return true;
}

const nodeBase = "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition";
const nodeActive = "bg-[#C78F50]/15 font-semibold text-[#8A5A26]";
const nodeInactive = "text-[#1A1A1A] hover:bg-[#F8FAFC]";
const nodeDropTarget = "ring-2 ring-[#C78F50] bg-[#C78F50]/10";

function CountBadge({ count }: { count: number }) {
  return (
    <span className="flex-shrink-0 rounded-full bg-[#E2E8F0] px-2 py-0.5 text-xs font-medium text-[#64748B]">{count}</span>
  );
}

// Nó da árvore que também é uma zona de soltar (arrastar peça(s) da grade
// até aqui — ver DndContext em ProductCategorization.tsx). `dropId` é
// sempre o resultado de destinationDropId (mesma chave usada pra achar o
// MoveDestination de volta no onDragEnd da página).
function TreeNodeButton({
  dropId,
  active,
  onClick,
  children,
}: {
  dropId: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={`${nodeBase} ${isOver ? nodeDropTarget : active ? nodeActive : nodeInactive}`}
    >
      {children}
    </button>
  );
}

export function CategoryTree({
  tree,
  activeFilter,
  onSelectFilter,
}: {
  tree: CategoryTree;
  activeFilter: BrowseFilter;
  onSelectFilter: (filter: BrowseFilter) => void;
}) {
  return (
    <nav aria-label="Categorias" className="space-y-0.5">
      <TreeNodeButton
        dropId={destinationDropId({ categoryId: null, subcategoryId: null })}
        active={sameBrowseFilter(activeFilter, { kind: "uncategorized" })}
        onClick={() => onSelectFilter({ kind: "uncategorized" })}
      >
        <span>Sem categoria</span>
        <CountBadge count={tree.uncategorized.productCount} />
      </TreeNodeButton>

      <button
        type="button"
        onClick={() => onSelectFilter({ kind: "all" })}
        className={`${nodeBase} ${sameBrowseFilter(activeFilter, { kind: "all" }) ? nodeActive : nodeInactive}`}
      >
        <span>Todas as peças</span>
      </button>

      <div className="mt-2 border-t border-[#E2E8F0] pt-2">
        {tree.categories.map((category) => (
          <div key={category.id}>
            <TreeNodeButton
              dropId={destinationDropId({ categoryId: category.id, subcategoryId: null })}
              active={sameBrowseFilter(activeFilter, { kind: "category", categoryId: category.id })}
              onClick={() => onSelectFilter({ kind: "category", categoryId: category.id })}
            >
              <span className="truncate">{category.name}</span>
              <CountBadge count={category.productCount} />
            </TreeNodeButton>
            {category.subcategories.length > 0 && (
              <div className="ml-3 space-y-0.5 border-l border-[#E2E8F0] pl-2">
                {category.subcategories.map((sub) => (
                  <TreeNodeButton
                    key={sub.id}
                    dropId={destinationDropId({ categoryId: category.id, subcategoryId: sub.id })}
                    active={sameBrowseFilter(activeFilter, { kind: "subcategory", categoryId: category.id, subcategoryId: sub.id })}
                    onClick={() => onSelectFilter({ kind: "subcategory", categoryId: category.id, subcategoryId: sub.id })}
                  >
                    <span className="truncate">{sub.name}</span>
                    <CountBadge count={sub.productCount} />
                  </TreeNodeButton>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
