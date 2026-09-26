import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Category, Product } from "../types";
import { CatalogHeader } from "../components/catalog/CatalogHeader";
import { CategoryNav } from "../components/catalog/CategoryNav";
import { ProductCard } from "../components/catalog/ProductCard";
import { FloatingCartButton } from "../components/catalog/FloatingCartButton";

export function Catalog() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  const categoryId = searchParams.get("categoria") ?? "";
  const subcategoryId = searchParams.get("subcategoria") ?? "";

  useEffect(() => {
    api.listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .listProducts({ active: true, categoryId: categoryId || undefined, subcategoryId: subcategoryId || undefined })
      .then((res) => setProducts(res.items))
      .finally(() => setLoading(false));
  }, [categoryId, subcategoryId]);

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
      <CatalogHeader />

      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold">Catálogo</h1>
        <p className="mt-1 text-[#64748B]">Conheça as peças disponíveis, organizadas por categoria.</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
          <CategoryNav
            categories={categories}
            categoryId={categoryId}
            subcategoryId={subcategoryId}
            onSelectCategory={handleSelectCategory}
            onSelectSubcategory={handleSelectSubcategory}
          />

          <div>
            {loading && <p className="text-[#64748B]">Carregando...</p>}
            {!loading && products.length === 0 && (
              <p className="text-[#64748B]">Nenhuma peça encontrada nessa categoria.</p>
            )}

            {!loading && products.length > 0 && (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <FloatingCartButton />
    </div>
  );
}
