import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { Category, Product } from "../types";
import { PublicHeader } from "../components/landing/PublicHeader";
import { WhatsAppFloatingButton } from "../components/landing/WhatsAppFloatingButton";
import { CategoryNav } from "../components/catalog/CategoryNav";
import { ProductCard } from "../components/catalog/ProductCard";
import { CloseIcon, SearchIcon } from "../components/landing/icons";
import { WHATSAPP_HREF } from "../lib/whatsapp";
import { hasMorePages, mergeProductPages } from "../lib/catalogPagination";
import { CATALOG_SORTS, parseCatalogSort, type CatalogSort } from "../lib/catalogSort";

// Mesmo limite do backend (ver listProductsQuerySchema) — corta antes de
// mandar a requisição, em vez de deixar o servidor rejeitar com 400.
const SEARCH_MAX_LENGTH = 100;

export function Catalog() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Evita que a resposta de uma busca antiga (ex: "carregar mais" da
  // categoria anterior, ainda em voo) seja aplicada depois que o usuário já
  // trocou de categoria — cada troca de filtro invalida requisições em
  // andamento da geração anterior.
  const generationRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const categoryId = searchParams.get("categoria") ?? "";
  const subcategoryId = searchParams.get("subcategoria") ?? "";
  const sort = parseCatalogSort(searchParams.get("ordem"));
  const q = searchParams.get("q") ?? "";
  const hasQuery = q.trim().length > 0;

  // Rascunho do campo de busca: só vira filtro (e dispara requisição) ao
  // enviar o formulário, não a cada tecla. Ressincroniza quando "q" muda por
  // outra via (voltar/avançar do navegador, "limpar busca", "ver todas").
  const [searchDraft, setSearchDraft] = useState(q);
  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  // Chegada pelo ícone de busca do cabeçalho (ver Header.tsx): foca o campo
  // uma única vez e descarta o state da navegação (senão focaria de novo a
  // cada re-render causado por outra troca de filtro).
  useEffect(() => {
    if ((location.state as { focusSearch?: boolean } | null)?.focusSearch) {
      searchInputRef.current?.focus();
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Único ponto que escreve na URL: monta os filtros do zero a cada chamada
  // (nunca faz merge com o searchParams atual), então trocar um sempre
  // preserva os outros automaticamente. "ordem" só entra na URL quando !=
  // "default" (mesma regra do backend); "q" só entra quando não vazio.
  function setFilters(next: { categoryId?: string; subcategoryId?: string; sort?: CatalogSort; q?: string }) {
    const params: Record<string, string> = {};
    if (next.categoryId) params.categoria = next.categoryId;
    if (next.subcategoryId) params.subcategoria = next.subcategoryId;
    if (next.sort && next.sort !== "default") params.ordem = next.sort;
    if (next.q) params.q = next.q;
    setSearchParams(params);
  }

  useEffect(() => {
    api.listCategories().then(setCategories);
  }, []);

  function loadFirstPage() {
    const generation = ++generationRef.current;
    setLoading(true);
    setLoadError(false);

    api
      .listProducts({
        active: true,
        categoryId: categoryId || undefined,
        subcategoryId: subcategoryId || undefined,
        q: q || undefined,
        page: 1,
        sort,
      })
      .then((res) => {
        if (generationRef.current !== generation) return;
        setProducts(res.items);
        setTotal(res.total);
        setPage(1);
      })
      .catch(() => {
        if (generationRef.current !== generation) return;
        setLoadError(true);
      })
      .finally(() => {
        if (generationRef.current !== generation) return;
        setLoading(false);
      });
  }

  // Troca de categoria/subcategoria/ordenação/busca reinicia a lista (nova geração, página 1).
  useEffect(() => {
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, subcategoryId, sort, q]);

  async function handleLoadMore() {
    const generation = generationRef.current;
    const nextPage = page + 1;
    setLoadingMore(true);
    setLoadMoreError(false);

    try {
      const res = await api.listProducts({
        active: true,
        categoryId: categoryId || undefined,
        subcategoryId: subcategoryId || undefined,
        q: q || undefined,
        page: nextPage,
        sort,
      });
      if (generationRef.current !== generation) return; // categoria trocou enquanto carregava

      setProducts((prev) => mergeProductPages(prev, res.items));
      setTotal(res.total);
      setPage(nextPage);
    } catch {
      if (generationRef.current !== generation) return;
      setLoadMoreError(true);
    } finally {
      if (generationRef.current === generation) setLoadingMore(false);
    }
  }

  function handleSelectCategory(id: string) {
    setFilters({ categoryId: id, sort, q });
  }

  function handleSelectSubcategory(catId: string, subId: string) {
    if (catId === categoryId && subId === subcategoryId) {
      setFilters({ categoryId: catId, sort, q });
    } else {
      setFilters({ categoryId: catId, subcategoryId: subId, sort, q });
    }
  }

  function handleSortChange(next: CatalogSort) {
    setFilters({ categoryId, subcategoryId, sort: next, q });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFilters({ categoryId, subcategoryId, sort, q: searchDraft.trim().slice(0, SEARCH_MAX_LENGTH) });
  }

  // Esvaziar o campo por qualquer meio (backspace, selecionar tudo e apagar,
  // recortar) com uma busca ativa na URL equivale a clicar no nosso "×": sai
  // da busca na hora, sem esperar o Enter/botão. Só dispara quando o campo
  // FICA vazio (não a cada tecla) e só se já havia "q" na URL — digitar
  // normalmente não chama a API a cada tecla.
  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.slice(0, SEARCH_MAX_LENGTH);
    setSearchDraft(value);
    if (value === "" && hasQuery) {
      setFilters({ categoryId, subcategoryId, sort, q: "" });
    }
  }

  function handleClearSearch() {
    setSearchDraft("");
    setFilters({ categoryId, subcategoryId, sort, q: "" });
  }

  function handleViewAllProducts() {
    setSearchDraft("");
    setSearchParams({});
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <PublicHeader />

      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold">{t("catalog.title")}</h1>
        <p className="mt-1 text-[#64748B]">{t("catalog.subtitle")}</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
          <CategoryNav
            categories={categories}
            categoryId={categoryId}
            subcategoryId={subcategoryId}
            onSelectCategory={handleSelectCategory}
            onSelectSubcategory={handleSelectSubcategory}
          />

          <div>
            <form role="search" onSubmit={handleSearchSubmit} className="mb-4 flex items-stretch gap-2">
              <div className="relative flex-1">
                <label htmlFor="catalog-search" className="sr-only">
                  {t("catalog.searchLabel")}
                </label>
                <input
                  id="catalog-search"
                  ref={searchInputRef}
                  // type="text" (não "search") de propósito: o "x" nativo do
                  // WebKit/Blink para type=search convivia mal com o nosso
                  // próprio botão de limpar (apareciam os dois, e só o nosso
                  // de fato atualizava a URL — ver histórico desta página).
                  // inputMode+enterKeyHint mantêm o teclado mobile com a
                  // tecla "Pesquisar", e o form continua com role="search".
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  value={searchDraft}
                  onChange={handleSearchChange}
                  maxLength={SEARCH_MAX_LENGTH}
                  placeholder={t("catalog.searchPlaceholder")}
                  // Defesa extra: IE/Edge legado desenha um "x" próprio
                  // (::-ms-clear) em qualquer input de texto não vazio.
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 pr-9 text-sm text-[#1A1A1A] focus:border-[#C78F50] focus:outline-none focus:ring-2 focus:ring-[#C78F50]/20 [&::-ms-clear]:hidden"
                />
                {searchDraft && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    aria-label={t("catalog.clearSearch")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] transition hover:text-[#1A1A1A]"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="flex shrink-0 items-center gap-2 rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-semibold text-[#010B1A] transition hover:bg-[#B37D3F]"
              >
                <SearchIcon className="h-4 w-4" />
                <span>{t("catalog.searchButton")}</span>
              </button>
            </form>

            {hasQuery && !loading && (
              <p className="mb-4 text-sm text-[#64748B]">
                {t("catalog.searchResultsCount", { count: total, term: q })}
              </p>
            )}

            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              <label htmlFor="catalog-sort" className="text-sm font-medium text-[#64748B]">
                {t("catalog.sortLabel")}
              </label>
              <select
                id="catalog-sort"
                value={sort}
                onChange={(e) => handleSortChange(e.target.value as CatalogSort)}
                className="max-w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#C78F50] focus:outline-none"
              >
                {CATALOG_SORTS.map((value) => (
                  <option key={value} value={value}>
                    {t(`catalog.sort.${value}`)}
                  </option>
                ))}
              </select>
            </div>

            {loading && <p className="text-[#64748B]">{t("catalog.loading")}</p>}

            {!loading && loadError && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-[#991B1B]">{t("catalog.loadMoreError")}</p>
                <button onClick={loadFirstPage} className="text-sm font-medium text-[#5F84BA] hover:underline">
                  {t("catalog.retry")}
                </button>
              </div>
            )}

            {!loading && !loadError && products.length === 0 && hasQuery && (
              <div className="flex flex-col items-start gap-3">
                <p className="text-[#64748B]">{t("catalog.searchEmpty", { term: q })}</p>
                <div className="flex gap-4">
                  <button onClick={handleClearSearch} className="text-sm font-medium text-[#5F84BA] hover:underline">
                    {t("catalog.clearSearch")}
                  </button>
                  <button onClick={handleViewAllProducts} className="text-sm font-medium text-[#5F84BA] hover:underline">
                    {t("catalog.viewAll")}
                  </button>
                </div>
              </div>
            )}

            {!loading && !loadError && products.length === 0 && !hasQuery && (
              <p className="text-[#64748B]">{t("catalog.empty")}</p>
            )}

            {!loading && !loadError && products.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
                  {products.map((product, index) => (
                    <ProductCard key={product.id} product={product} priority={index < 3} />
                  ))}
                </div>

                <div className="mt-8 flex flex-col items-center gap-3">
                  <p className="text-sm text-[#64748B]">
                    {t("catalog.showingCount", { shown: products.length, total })}
                  </p>

                  {hasMorePages(products.length, total) && !loadMoreError && (
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="rounded-full border border-[#C78F50] px-6 py-2 text-sm font-semibold text-[#C78F50] transition hover:bg-[#C78F50]/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loadingMore ? t("catalog.loadingMore") : t("catalog.loadMore")}
                    </button>
                  )}

                  {loadMoreError && (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-sm text-[#991B1B]">{t("catalog.loadMoreError")}</p>
                      <button
                        onClick={handleLoadMore}
                        className="text-sm font-medium text-[#5F84BA] hover:underline"
                      >
                        {t("catalog.retry")}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
    </div>
  );
}
