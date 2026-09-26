import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Category, Product } from "../types";
import { CatalogHeader } from "../components/catalog/CatalogHeader";
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

  const selectedCategory = useMemo(() => categories.find((c) => c.id === categoryId), [categories, categoryId]);

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

  function handleSelectSubcategory(id: string) {
    const next = new URLSearchParams(searchParams);
    if (id && id !== subcategoryId) {
      next.set("subcategoria", id);
    } else {
      next.delete("subcategoria");
    }
    setSearchParams(next);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <CatalogHeader />

      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold">Catálogo</h1>
        <p className="mt-1 text-[#64748B]">Conheça as peças disponíveis, organizadas por categoria.</p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={() => handleSelectCategory("")}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              !categoryId
                ? "border-[#1B3A6B] bg-[#1B3A6B] text-white"
                : "border-[#E2E8F0] bg-white text-[#1A1A1A] hover:border-[#1B3A6B]"
            }`}
          >
            Todas
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => handleSelectCategory(category.id)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                categoryId === category.id
                  ? "border-[#1B3A6B] bg-[#1B3A6B] text-white"
                  : "border-[#E2E8F0] bg-white text-[#1A1A1A] hover:border-[#1B3A6B]"
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>

        {selectedCategory && selectedCategory.subcategories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedCategory.subcategories.map((subcategory) => (
              <button
                key={subcategory.id}
                onClick={() => handleSelectSubcategory(subcategory.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  subcategoryId === subcategory.id
                    ? "border-[#1B3A6B] bg-[#EFF6FF] text-[#1B3A6B]"
                    : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#1B3A6B]"
                }`}
              >
                {subcategory.name}
              </button>
            ))}
          </div>
        )}

        {loading && <p className="mt-10 text-[#64748B]">Carregando...</p>}
        {!loading && products.length === 0 && (
          <p className="mt-10 text-[#64748B]">Nenhuma peça encontrada nessa categoria.</p>
        )}

        {!loading && products.length > 0 && (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      <FloatingCartButton />
    </div>
  );
}
