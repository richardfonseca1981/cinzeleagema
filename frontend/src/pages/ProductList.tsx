import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useToast } from "../components/Toast";
import { Pagination } from "../components/Pagination";
import { PAGE_SIZE_OPTIONS, rangeText, totalPages } from "../lib/pagination";
import {
  MAX_QUERY_LENGTH,
  applyChange,
  parseListState,
  sanitizeAgainstCategories,
  serializeListState,
  toApiParams,
  type ProductListState,
  type StatusFilter,
} from "../lib/productListState";
import type { Category, Product } from "../types";

// Debounce da busca por nome/SKU (ms).
const SEARCH_DEBOUNCE_MS = 300;
// Acima disto, a paginação também aparece no topo da lista.
const ROWS_FOR_TOP_PAGINATION = 20;

const fieldClass =
  "rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#C78F50] focus:ring-2 focus:ring-[#C78F50]/20";

interface PageData {
  items: Product[];
  total: number;
  // Página e tamanho a que estas linhas pertencem (o texto "Mostrando X–Y"
  // descreve o que está na tela, não a página que ainda está carregando).
  page: number;
  pageSize: number;
}

export function ProductList() {
  const { showToast } = useToast();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // O estado da lista (página, busca, filtros) vive na URL: F5, Voltar e o
  // retorno da edição reabrem exatamente a mesma página.
  const state = useMemo(() => parseListState(searchParams), [searchParams]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [searchInput, setSearchInput] = useState(state.q);
  const topRef = useRef<HTMLDivElement>(null);
  // Último valor de busca que ESTE componente escreveu na URL — distingue a
  // nossa própria confirmação do debounce (não mexer no campo) de uma mudança
  // externa de URL (Voltar/F5), que deve atualizar o campo.
  const committedQRef = useRef(state.q);

  const update = useCallback(
    (patch: Partial<ProductListState>, options: { replace?: boolean } = {}) => {
      setSearchParams((prev) => serializeListState(applyChange(parseListState(prev), patch)), { replace: options.replace });
    },
    [setSearchParams]
  );

  useEffect(() => {
    api.listCategories().then(setCategories);
  }, []);

  // Categoria/subcategoria que não existem (link antigo) saem da URL.
  useEffect(() => {
    if (categories.length === 0) return;
    const clean = sanitizeAgainstCategories(state, categories);
    if (clean !== state) setSearchParams(serializeListState(clean), { replace: true });
  }, [categories, state, setSearchParams]);

  // Busca: mudança de URL vinda de fora (Voltar/F5) atualiza o campo; a nossa
  // própria confirmação do debounce não (senão engoliria o que o usuário
  // digitou enquanto a página recarregava).
  useEffect(() => {
    if (state.q === committedQRef.current) return;
    committedQRef.current = state.q;
    setSearchInput(state.q);
  }, [state.q]);

  // Debounce de 300 ms; mudar a busca volta para a página 1 (applyChange).
  useEffect(() => {
    const term = searchInput.trim().slice(0, MAX_QUERY_LENGTH);
    if (term === state.q) return;
    const timer = setTimeout(() => {
      committedQRef.current = term;
      update({ q: term }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, state.q, update]);

  // Carga da página atual. Mantém as linhas anteriores visíveis enquanto
  // carrega (sem piscar tela vazia) e ignora respostas de requisições velhas.
  const apiKey = JSON.stringify(toApiParams(state));
  // Sempre a versão mais recente de update (o setSearchParams do router muda
  // de identidade a cada navegação; a carga não deve refazer por causa disso).
  const updateRef = useRef(update);
  updateRef.current = update;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    api
      .listProducts(toApiParams(state))
      .then((res) => {
        if (cancelled) return;
        const pages = totalPages(res.total, state.pageSize);
        if (state.page > pages) {
          // Página fora do intervalo (page=999, ou a última página esvaziou
          // depois de desativar/excluir): vai para a última que existe.
          updateRef.current({ page: pages }, { replace: true });
          return;
        }
        setData({ items: res.items, total: res.total, page: state.page, pageSize: state.pageSize });
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // apiKey resume tudo o que muda a requisição
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, reloadTick]);

  function goToPage(page: number) {
    update({ page });
    topRef.current?.scrollIntoView({ block: "start" });
  }

  async function handleToggleActive(product: Product) {
    try {
      const updated = product.active ? await api.deactivateProduct(product.id) : await api.activateProduct(product.id);
      if (state.status === "all") {
        setData((prev) => (prev ? { ...prev, items: prev.items.map((p) => (p.id === updated.id ? updated : p)) } : prev));
      } else {
        // Com filtro de status a linha sai desta lista: recarrega a página
        // (e, se ela esvaziar, a carga acima volta para a anterior).
        setReloadTick((t) => t + 1);
      }
      showToast("success", updated.active ? "Produto ativado" : "Produto desativado");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível atualizar o produto");
    }
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = totalPages(total, state.pageSize);
  const hasFilters = Boolean(state.q || state.category || state.status !== "all");
  const selectedCategory = categories.find((c) => c.id === state.category);
  // Estado da lista que os links de edição devolvem ao voltar.
  const listSearch = location.search;

  const paginationFooter = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[#64748B]" aria-live="polite">
        {rangeText(data?.page ?? state.page, data?.pageSize ?? state.pageSize, total)}
      </p>
      <Pagination page={state.page} pages={pages} onChange={goToPage} disabled={loading} />
      <label className="flex items-center gap-2 text-sm text-[#64748B]">
        Itens por página
        <select
          value={state.pageSize}
          onChange={(e) => update({ pageSize: Number(e.target.value) })}
          className={fieldClass}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <div ref={topRef}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#1A1A1A]">Produtos</h1>
        <Link
          to="/admin/produtos/novo"
          state={{ from: listSearch }}
          className="rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-medium text-[#010B1A] transition hover:bg-[#B37D3F]"
        >
          Novo produto
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          maxLength={MAX_QUERY_LENGTH}
          placeholder="Buscar por nome ou SKU..."
          aria-label="Buscar produtos por nome ou SKU"
          className={`min-w-[220px] flex-1 ${fieldClass}`}
        />
        <select
          value={state.category}
          onChange={(e) => update({ category: e.target.value })}
          aria-label="Filtrar por categoria"
          className={fieldClass}
        >
          <option value="">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {selectedCategory && selectedCategory.subcategories.length > 0 && (
          <select
            value={state.subcategory}
            onChange={(e) => update({ subcategory: e.target.value })}
            aria-label="Filtrar por subcategoria"
            className={fieldClass}
          >
            <option value="">Todas as subcategorias</option>
            {selectedCategory.subcategories.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        )}
        <select
          value={state.status}
          onChange={(e) => update({ status: e.target.value as StatusFilter })}
          aria-label="Filtrar por status"
          className={fieldClass}
        >
          <option value="all">Ativos e inativos</option>
          <option value="active">Somente ativos</option>
          <option value="inactive">Somente inativos</option>
        </select>
      </div>

      {loadError && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#EF4444] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          <span>Não foi possível carregar os produtos.</span>
          <button
            type="button"
            onClick={() => setReloadTick((t) => t + 1)}
            className="rounded-lg border border-[#EF4444] px-3 py-1 font-medium transition hover:bg-white"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {items.length > ROWS_FOR_TOP_PAGINATION && pages > 1 && (
        <div className="mb-3 flex justify-end">
          <Pagination page={state.page} pages={pages} onChange={goToPage} disabled={loading} />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white" aria-busy={loading}>
        {loading && data && (
          <p className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-1.5 text-xs text-[#64748B]" role="status">
            Atualizando...
          </p>
        )}
        <table className={`w-full text-left text-sm transition-opacity ${loading && data ? "opacity-60" : ""}`}>
          <thead className="bg-[#F8FAFC] text-[#64748B]">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Preço</th>
              <th className="px-4 py-2">Estoque</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[#64748B]">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && !loadError && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <p className="font-medium text-[#1A1A1A]">
                    {hasFilters ? "Nenhum produto encontrado" : "Nenhum produto cadastrado ainda"}
                  </p>
                  <p className="mt-1 text-sm text-[#64748B]">
                    {hasFilters
                      ? "Tente ajustar a busca ou os filtros."
                      : 'Clique em "Novo produto" para cadastrar a primeira peça do catálogo.'}
                  </p>
                </td>
              </tr>
            )}
            {items.map((product) => (
              <tr key={product.id} className={`border-t border-[#E2E8F0] ${!product.active ? "bg-[#F8FAFC]" : ""}`}>
                <td className="px-4 py-2 text-[#1A1A1A]">{product.name}</td>
                <td className="px-4 py-2 text-[#1A1A1A]">
                  {Number(product.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td className="px-4 py-2 text-[#64748B]">
                  {product.trackStock ? product.stockQty : "Peça única"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      product.active
                        ? "border-[#22C55E] bg-[#F0FDF4] text-[#15803D]"
                        : "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"
                    }`}
                  >
                    {product.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    to={`/admin/produtos/${product.id}`}
                    state={{ from: listSearch }}
                    className="mr-3 text-[#5F84BA] hover:underline"
                  >
                    Editar
                  </Link>
                  <button onClick={() => handleToggleActive(product)} className="text-[#64748B] hover:underline">
                    {product.active ? "Desativar" : "Ativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && <div className="mt-3">{paginationFooter}</div>}
    </div>
  );
}
