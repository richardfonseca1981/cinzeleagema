import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { fetchAllActiveProducts, filterPickerProducts, selectAllFiltered, toggleSelectedId } from "../../lib/catalogProductPicker";
import { formatAdminPrice, formatAdminSku } from "../../lib/adminProductFormat";
import type { CatalogOptionsCategory, Product } from "../../types";

const fieldClass =
  "rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#C78F50] focus:ring-2 focus:ring-[#C78F50]/20";

export function ProductPicker({ selectedIds, onChangeSelected }: { selectedIds: string[]; onChangeSelected: (ids: string[]) => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<CatalogOptionsCategory[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    Promise.all([api.getCatalogOptions(), fetchAllActiveProducts(api.listProducts)])
      .then(([options, all]) => {
        if (cancelled) return;
        setCategories(options.categories);
        setProducts(all);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(() => filterPickerProducts(products ?? [], { search, categoryId }), [products, search, categoryId]);

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
      {products === null && !loadError && <p className="text-sm text-[#64748B]">Carregando peças...</p>}
      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-[#EF4444] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          <span>Não foi possível carregar as peças.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-[#EF4444] px-3 py-1 font-medium hover:bg-white"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {products !== null && !loadError && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou Ref..."
              aria-label="Buscar peças por nome ou Ref"
              className={`min-w-[200px] flex-1 ${fieldClass}`}
            />
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filtrar por categoria" className={fieldClass}>
              <option value="">Todas as categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.count})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onChangeSelected(selectAllFiltered(selectedIds, filtered))}
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm hover:bg-[#F8FAFC]"
            >
              Selecionar todas ({filtered.length})
            </button>
            <button
              type="button"
              onClick={() => onChangeSelected([])}
              disabled={selectedIds.length === 0}
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Limpar
            </button>
          </div>

          <p className="mb-2 text-sm font-medium text-[#1A1A1A]" aria-live="polite">
            {selectedIds.length} peça{selectedIds.length === 1 ? "" : "s"} selecionada{selectedIds.length === 1 ? "" : "s"}
          </p>

          <ul className="max-h-96 divide-y divide-[#E2E8F0] overflow-y-auto rounded-lg border border-[#E2E8F0]">
            {filtered.length === 0 && <li className="px-4 py-6 text-center text-sm text-[#64748B]">Nenhuma peça encontrada.</li>}
            {filtered.map((product) => {
              const checked = selectedSet.has(product.id);
              const cover = product.images[0]?.url;
              return (
                <li key={product.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[#F8FAFC]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onChangeSelected(toggleSelectedId(selectedIds, product.id))}
                      className="h-4 w-4 shrink-0 accent-[#C78F50]"
                    />
                    {cover ? (
                      <img src={cover} alt="" className="h-10 w-8 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-8 shrink-0 rounded bg-[#E2E8F0]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#1A1A1A]">{product.name || "(sem nome)"}</p>
                      <p className="truncate text-xs text-[#64748B]">
                        {formatAdminSku(product.sku)} · {product.category?.name ?? "Sem categoria"}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-[#1A1A1A]">{formatAdminPrice(product.price)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
