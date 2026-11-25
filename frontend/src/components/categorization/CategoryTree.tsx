import type { CategoryTree } from "../../types";

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

function CountBadge({ count }: { count: number }) {
  return (
    <span className="flex-shrink-0 rounded-full bg-[#E2E8F0] px-2 py-0.5 text-xs font-medium text-[#64748B]">{count}</span>
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
      <button
        type="button"
        onClick={() => onSelectFilter({ kind: "uncategorized" })}
        className={`${nodeBase} ${sameBrowseFilter(activeFilter, { kind: "uncategorized" }) ? nodeActive : nodeInactive}`}
      >
        <span>Sem categoria</span>
        <CountBadge count={tree.uncategorized.productCount} />
      </button>

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
            <button
              type="button"
              onClick={() => onSelectFilter({ kind: "category", categoryId: category.id })}
              className={`${nodeBase} ${sameBrowseFilter(activeFilter, { kind: "category", categoryId: category.id }) ? nodeActive : nodeInactive}`}
            >
              <span className="truncate">{category.name}</span>
              <CountBadge count={category.productCount} />
            </button>
            {category.subcategories.length > 0 && (
              <div className="ml-3 space-y-0.5 border-l border-[#E2E8F0] pl-2">
                {category.subcategories.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => onSelectFilter({ kind: "subcategory", categoryId: category.id, subcategoryId: sub.id })}
                    className={`${nodeBase} ${
                      sameBrowseFilter(activeFilter, { kind: "subcategory", categoryId: category.id, subcategoryId: sub.id })
                        ? nodeActive
                        : nodeInactive
                    }`}
                  >
                    <span className="truncate">{sub.name}</span>
                    <CountBadge count={sub.productCount} />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
