import { useMemo, useState } from "react";
import type { CategoryTree } from "../../types";

export interface MoveDestination {
  categoryId: string | null;
  subcategoryId: string | null;
  label: string;
}

interface FlatOption extends MoveDestination {
  searchText: string;
}

// Lista achatada de destinos possíveis: "Sem categoria" + cada categoria +
// cada subcategoria (com o nome da categoria-mãe no rótulo, pra não
// confundir subcategorias de nomes parecidos em categorias diferentes).
export function flattenDestinations(tree: CategoryTree): MoveDestination[] {
  const options: MoveDestination[] = [{ categoryId: null, subcategoryId: null, label: "Sem categoria" }];
  for (const category of tree.categories) {
    options.push({ categoryId: category.id, subcategoryId: null, label: category.name });
    for (const sub of category.subcategories) {
      options.push({ categoryId: category.id, subcategoryId: sub.id, label: `${category.name} > ${sub.name}` });
    }
  }
  return options;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

export function filterDestinations(options: MoveDestination[], query: string): MoveDestination[] {
  const q = normalize(query);
  if (!q) return options;
  return options.filter((o) => normalize(o.label).includes(q));
}

// Popover simples com busca — sem biblioteca de combobox (nenhuma no
// projeto ainda, ver investigação), construído com o mesmo padrão de
// input+lista já usado em ProductOrder.tsx.
export function MoveToPicker({
  tree,
  onSelect,
  onClose,
}: {
  tree: CategoryTree;
  onSelect: (destination: MoveDestination) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const options: FlatOption[] = useMemo(
    () => flattenDestinations(tree).map((o) => ({ ...o, searchText: normalize(o.label) })),
    [tree]
  );
  const filtered = useMemo(() => filterDestinations(options, query), [options, query]);

  return (
    <div
      role="dialog"
      aria-label="Mover para"
      className="absolute z-30 mt-2 w-72 rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-xl"
    >
      <div className="flex items-center justify-between gap-2">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar categoria..."
          aria-label="Buscar categoria ou subcategoria"
          className="min-w-0 flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#C78F50]"
        />
        <button type="button" onClick={onClose} aria-label="Fechar" className="flex-shrink-0 text-[#64748B] hover:text-[#1A1A1A]">
          ×
        </button>
      </div>
      <ul className="mt-2 max-h-64 overflow-y-auto">
        {filtered.length === 0 && <li className="px-2 py-2 text-sm text-[#64748B]">Nenhuma categoria encontrada.</li>}
        {filtered.map((option) => (
          <li key={`${option.categoryId ?? "none"}-${option.subcategoryId ?? "none"}`}>
            <button
              type="button"
              onClick={() => onSelect({ categoryId: option.categoryId, subcategoryId: option.subcategoryId, label: option.label })}
              className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-[#1A1A1A] hover:bg-[#F8FAFC]"
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
