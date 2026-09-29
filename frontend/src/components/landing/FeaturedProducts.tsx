import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import type { Product } from "../../types";
import { ProductCard } from "../catalog/ProductCard";

export function FeaturedProducts() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    api
      .listProducts({ active: true, pageSize: 6 })
      .then((res) => {
        setProducts(res.items);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  // Falha na API não deve quebrar a landing — some a seção em silêncio.
  if (status === "error") return null;

  return (
    <section id="produtos" className="bg-[#F8FAFC] py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#C78F50]">{t("featuredProducts.eyebrow")}</p>
          <h2 className="mt-2 text-2xl font-bold text-[#1A1A1A] sm:text-3xl">{t("featuredProducts.title")}</h2>
        </div>

        {status === "ready" && products.length === 0 && (
          <p className="mt-10 text-center text-[#64748B]">{t("featuredProducts.empty")}</p>
        )}

        {products.length > 0 && (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <Link
            to="/catalogo"
            className="inline-flex items-center justify-center rounded-full bg-[#C78F50] px-8 py-3 text-sm font-semibold text-[#010B1A] shadow-sm transition hover:bg-[#B37D3F]"
          >
            {t("featuredProducts.cta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
