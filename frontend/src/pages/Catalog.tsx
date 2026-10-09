import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { Category, Product } from "../types";
import { PublicHeader } from "../components/landing/PublicHeader";
import { WhatsAppFloatingButton } from "../components/landing/WhatsAppFloatingButton";
import { CategoryNav } from "../components/catalog/CategoryNav";
import { ProductCard } from "../components/catalog/ProductCard";
import { WHATSAPP_HREF } from "../lib/whatsapp";
import { hasMorePages, mergeProductPages } from "../lib/catalogPagination";

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

  // Evita que a resposta de uma busca antiga (ex: "carregar mais" da
  // categoria anterior, ainda em voo) seja aplicada depois que o usuário já
  // trocou de categoria — cada troca de filtro invalida requisições em
  // andamento da geração anterior.
  const generationRef = useRef(0);

  const categoryId = searchParams.get("categoria") ?? "";
  const subcategoryId = searchParams.get("subcategoria") ?? "";

  useEffect(() => {
    api.listCategories().then(setCategories);
  }, []);

  function loadFirstPage() {
    const generation = ++generationRef.current;
    setLoading(true);
    setLoadError(false);

    api
      .listProducts({ active: true, categoryId: categoryId || undefined, subcategoryId: subcategoryId || undefined, page: 1 })
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

  // Troca de categoria/subcategoria reinicia a lista (nova geração, página 1).
  useEffect(() => {
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, subcategoryId]);

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
        page: nextPage,
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
    setSearchParams(id ? { categoria: id } : {});
  }

  function handleSelectSubcategory(catId: string, subId: string) {
    if (catId === categoryId && subId === subcategoryId) {
      setSearchParams({ categoria: catId });
    } else {
      setSearchParams({ categoria: catId, subcategoria: subId });
    }
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
            {loading && <p className="text-[#64748B]">{t("catalog.loading")}</p>}

            {!loading && loadError && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-[#991B1B]">{t("catalog.loadMoreError")}</p>
                <button onClick={loadFirstPage} className="text-sm font-medium text-[#5F84BA] hover:underline">
                  {t("catalog.retry")}
                </button>
              </div>
            )}

            {!loading && !loadError && products.length === 0 && (
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
