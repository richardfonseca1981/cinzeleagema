import { useState } from "react";
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
const iconButton = "flex-shrink-0 rounded px-1 text-xs text-[#94A3B8] hover:bg-[#E2E8F0] hover:text-[#1A1A1A]";

function CountBadge({ count }: { count: number }) {
  return (
    <span className="flex-shrink-0 rounded-full bg-[#E2E8F0] px-2 py-0.5 text-xs font-medium text-[#64748B]">{count}</span>
  );
}

// Formulário inline (criar OU renomear, mesmo visual) — Enter confirma,
// Esc/blur sem digitar nada cancela. `pending` desabilita os controles
// enquanto a chamada à API está em voo (evita duplo-clique criar/renomear
// duas vezes).
function InlineNameForm({
  initialValue = "",
  placeholder,
  pending,
  onSubmit,
  onCancel,
}: {
  initialValue?: string;
  placeholder: string;
  pending: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1 px-1 py-0.5">
      <input
        autoFocus
        type="text"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded border border-[#C78F50] px-2 py-1 text-sm outline-none"
      />
      <button type="submit" disabled={pending || !value.trim()} className={iconButton} aria-label="Confirmar">
        ✓
      </button>
      <button type="button" onClick={onCancel} disabled={pending} className={iconButton} aria-label="Cancelar">
        ✕
      </button>
    </form>
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

export interface CategoryTreeActions {
  onCreateCategory: (name: string) => Promise<void>;
  onRenameCategory: (id: string, name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onCreateSubcategory: (categoryId: string, name: string) => Promise<void>;
  onRenameSubcategory: (id: string, name: string) => Promise<void>;
  onDeleteSubcategory: (id: string) => Promise<void>;
}

// Qual nó está sendo editado/criado agora — um de cada vez (editar dois nós
// ao mesmo tempo não agrega nada e só complica o estado).
type EditingState =
  | { kind: "none" }
  | { kind: "creatingCategory" }
  | { kind: "creatingSubcategory"; categoryId: string }
  | { kind: "renamingCategory"; id: string }
  | { kind: "renamingSubcategory"; id: string };

export function CategoryTree({
  tree,
  activeFilter,
  onSelectFilter,
  actions,
}: {
  tree: CategoryTree;
  activeFilter: BrowseFilter;
  onSelectFilter: (filter: BrowseFilter) => void;
  actions: CategoryTreeActions;
}) {
  const [editing, setEditing] = useState<EditingState>({ kind: "none" });
  const [pending, setPending] = useState(false);

  function cancelEditing() {
    setEditing({ kind: "none" });
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    try {
      await action();
      setEditing({ kind: "none" });
    } finally {
      setPending(false);
    }
  }

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
            {editing.kind === "renamingCategory" && editing.id === category.id ? (
              <InlineNameForm
                initialValue={category.name}
                placeholder="Nome da categoria"
                pending={pending}
                onCancel={cancelEditing}
                onSubmit={(name) => run(() => actions.onRenameCategory(category.id, name))}
              />
            ) : (
              <div className="group flex items-center gap-1">
                <TreeNodeButton
                  dropId={destinationDropId({ categoryId: category.id, subcategoryId: null })}
                  active={sameBrowseFilter(activeFilter, { kind: "category", categoryId: category.id })}
                  onClick={() => onSelectFilter({ kind: "category", categoryId: category.id })}
                >
                  <span className="truncate">{category.name}</span>
                  <CountBadge count={category.productCount} />
                </TreeNodeButton>
                <button
                  type="button"
                  aria-label={`Renomear ${category.name}`}
                  onClick={() => setEditing({ kind: "renamingCategory", id: category.id })}
                  className={iconButton}
                >
                  ✎
                </button>
                <button
                  type="button"
                  aria-label={`Apagar ${category.name}`}
                  onClick={() => run(() => actions.onDeleteCategory(category.id))}
                  className={iconButton}
                >
                  ✕
                </button>
              </div>
            )}

            {category.subcategories.length > 0 && (
              <div className="ml-3 space-y-0.5 border-l border-[#E2E8F0] pl-2">
                {category.subcategories.map((sub) =>
                  editing.kind === "renamingSubcategory" && editing.id === sub.id ? (
                    <InlineNameForm
                      key={sub.id}
                      initialValue={sub.name}
                      placeholder="Nome da subcategoria"
                      pending={pending}
                      onCancel={cancelEditing}
                      onSubmit={(name) => run(() => actions.onRenameSubcategory(sub.id, name))}
                    />
                  ) : (
                    <div key={sub.id} className="flex items-center gap-1">
                      <TreeNodeButton
                        dropId={destinationDropId({ categoryId: category.id, subcategoryId: sub.id })}
                        active={sameBrowseFilter(activeFilter, { kind: "subcategory", categoryId: category.id, subcategoryId: sub.id })}
                        onClick={() => onSelectFilter({ kind: "subcategory", categoryId: category.id, subcategoryId: sub.id })}
                      >
                        <span className="truncate">{sub.name}</span>
                        <CountBadge count={sub.productCount} />
                      </TreeNodeButton>
                      <button
                        type="button"
                        aria-label={`Renomear ${sub.name}`}
                        onClick={() => setEditing({ kind: "renamingSubcategory", id: sub.id })}
                        className={iconButton}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        aria-label={`Apagar ${sub.name}`}
                        onClick={() => run(() => actions.onDeleteSubcategory(sub.id))}
                        className={iconButton}
                      >
                        ✕
                      </button>
                    </div>
                  )
                )}
              </div>
            )}

            {editing.kind === "creatingSubcategory" && editing.categoryId === category.id ? (
              <div className="ml-3 pl-2">
                <InlineNameForm
                  placeholder="Nova subcategoria"
                  pending={pending}
                  onCancel={cancelEditing}
                  onSubmit={(name) => run(() => actions.onCreateSubcategory(category.id, name))}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditing({ kind: "creatingSubcategory", categoryId: category.id })}
                className="ml-3 pl-2 text-xs font-medium text-[#5F84BA] hover:underline"
              >
                + Subcategoria
              </button>
            )}
          </div>
        ))}
      </div>

      {editing.kind === "creatingCategory" ? (
        <InlineNameForm
          placeholder="Nova categoria"
          pending={pending}
          onCancel={cancelEditing}
          onSubmit={(name) => run(() => actions.onCreateCategory(name))}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing({ kind: "creatingCategory" })}
          className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-[#5F84BA] hover:bg-[#F8FAFC] hover:underline"
        >
          + Nova categoria
        </button>
      )}
    </nav>
  );
}
