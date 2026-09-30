import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../lib/api";
import type { Product } from "../types";
import { PublicHeader } from "../components/landing/PublicHeader";
import { WhatsAppFloatingButton } from "../components/landing/WhatsAppFloatingButton";
import { formatPrice, formatWeightSize, localizeCategoryName, localizeText } from "../lib/format";
import { WHATSAPP_HREF } from "../lib/whatsapp";
import { useCart } from "../lib/cart";
import { useToast } from "../components/Toast";

export function ProductDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const weightSize = product ? formatWeightSize(product.weightGrams, product.sizeCm, i18n.language) : null;
  const displayName = product ? localizeText(product.name, product.nameEn, i18n.language) : "";
  const displayDescription = product
    ? localizeText(product.description ?? "", product.descriptionEn, i18n.language)
    : "";

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
        nameEn: product.nameEn,
        unitPrice: Number(product.price),
        imageUrl: product.images[0]?.url ?? null,
        weightGrams: Number(product.weightGrams),
        sizeCm: Number(product.sizeCm),
      },
      quantity
    );
    showToast("success", t("productCard.addedToast"));
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <PublicHeader />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link to="/catalogo" className="text-sm font-medium text-[#1B3A6B] hover:underline">
          {t("productDetail.back")}
        </Link>

        {loading && <p className="mt-6 text-[#64748B]">{t("productDetail.loading")}</p>}
        {notFound && <p className="mt-6 text-[#64748B]">{t("productDetail.notFound")}</p>}

        {product && (
          <div className="mt-6 grid gap-8 sm:grid-cols-2">
            {product.images[0] ? (
              <img
                src={product.images[0].url}
                alt={displayName}
                className="aspect-square w-full rounded-xl border border-[#E2E8F0] object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] text-sm text-[#94A3B8]">
                {t("productCard.noPhoto")}
              </div>
            )}

            <div>
              {(product.category || product.subcategory) && (
                <p className="text-sm font-medium uppercase tracking-wide text-[#94A3B8]">
                  {[
                    product.category && localizeCategoryName(t, product.category.name),
                    product.subcategory && localizeCategoryName(t, product.subcategory.name),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <h1 className="mt-1 text-2xl font-bold">{displayName}</h1>
              {displayDescription && <p className="mt-4 text-[#1A1A1A]">{displayDescription}</p>}
              {weightSize && <p className="mt-4 text-sm text-[#64748B]">{weightSize}</p>}
              <p className="mt-2 text-2xl font-bold text-[#1B3A6B]">{formatPrice(product.price, i18n.language)}</p>

              <div className="mt-6 flex items-center gap-3">
                <label htmlFor="quantity" className="text-sm font-medium text-[#1A1A1A]">
                  {t("productDetail.quantity")}
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
                {t("productCard.addToOrder")}
              </button>
            </div>
          </div>
        )}
      </div>
      <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
    </div>
  );
}
