import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { Product } from "../types";
import { CatalogHeader } from "../components/catalog/CatalogHeader";
import { FloatingCartButton } from "../components/catalog/FloatingCartButton";
import { formatPrice, formatWeightSize } from "../lib/format";
import { useCart } from "../lib/cart";
import { useToast } from "../components/Toast";

export function ProductDetail() {
  const { id } = useParams();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getProduct(id)
      .then(setProduct)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  function handleAdd() {
    if (!product) return;
    addItem(
      {
        productId: product.id,
        name: product.name,
        unitPrice: Number(product.price),
        imageUrl: product.images[0]?.url ?? null,
      },
      quantity
    );
    showToast("success", "Adicionado ao pedido");
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <CatalogHeader />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link to="/catalogo" className="text-sm font-medium text-[#1B3A6B] hover:underline">
          ← Voltar ao catálogo
        </Link>

        {loading && <p className="mt-6 text-[#64748B]">Carregando...</p>}
        {notFound && <p className="mt-6 text-[#64748B]">Peça não encontrada.</p>}

        {product && (
          <div className="mt-6 grid gap-8 sm:grid-cols-2">
            {product.images[0] ? (
              <img
                src={product.images[0].url}
                alt={product.name}
                className="aspect-square w-full rounded-xl border border-[#E2E8F0] object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] text-sm text-[#94A3B8]">
                Sem foto
              </div>
            )}

            <div>
              {(product.category || product.subcategory) && (
                <p className="text-sm font-medium uppercase tracking-wide text-[#94A3B8]">
                  {[product.category?.name, product.subcategory?.name].filter(Boolean).join(" · ")}
                </p>
              )}
              <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
              {product.description && <p className="mt-4 text-[#1A1A1A]">{product.description}</p>}
              <p className="mt-4 text-sm text-[#64748B]">{formatWeightSize(product.weightGrams, product.sizeCm)}</p>
              <p className="mt-2 text-2xl font-bold text-[#1B3A6B]">{formatPrice(product.price)}</p>

              <div className="mt-6 flex items-center gap-3">
                <label htmlFor="quantity" className="text-sm font-medium text-[#1A1A1A]">
                  Quantidade
                </label>
                <input
                  id="quantity"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  className="w-20 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none transition focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]"
                />
              </div>

              <button
                onClick={handleAdd}
                className="mt-4 w-full rounded-lg bg-[#1B3A6B] px-4 py-3 font-semibold text-white transition hover:bg-[#152D54] sm:w-auto"
              >
                Adicionar ao pedido
              </button>
            </div>
          </div>
        )}
      </div>
      <FloatingCartButton />
    </div>
  );
}
