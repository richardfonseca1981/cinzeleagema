import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Product } from "../../types";
import { formatPrice, formatWeightSize, localizeText } from "../../lib/format";
import { useCart } from "../../lib/cart";
import { useToast } from "../Toast";

export function ProductCard({ product }: { product: Product }) {
  const { t, i18n } = useTranslation();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const image = product.images[0]?.url ?? null;
  const weightSize = formatWeightSize(product.weightGrams, product.sizeCm, i18n.language);
  const displayName = localizeText(product.name, product.nameEn, i18n.language);
  const displayDescription = localizeText(product.description ?? "", product.descriptionEn, i18n.language);

  function handleAdd() {
    addItem({
      productId: product.id,
      name: product.name,
      nameEn: product.nameEn,
      unitPrice: Number(product.price),
      imageUrl: image,
      weightGrams: Number(product.weightGrams),
      sizeCm: Number(product.sizeCm),
    });
    showToast("success", t("productCard.addedToast"));
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm transition hover:shadow-md">
      <Link to={`/catalogo/${product.id}`} className="block">
        {image ? (
          <img src={image} alt={displayName} className="h-48 w-full object-cover" />
        ) : (
          <div className="flex h-48 w-full items-center justify-center bg-[#F1F5F9] text-sm text-[#94A3B8]">
            {t("productCard.noPhoto")}
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Link to={`/catalogo/${product.id}`}>
          <h3 className="font-semibold text-[#1A1A1A] transition hover:text-[#5F84BA]">{displayName}</h3>
        </Link>
        {displayDescription && (
          <p className="mt-1 line-clamp-2 flex-1 text-sm text-[#64748B]">{displayDescription}</p>
        )}
        {weightSize && <p className="mt-2 text-xs text-[#94A3B8]">{weightSize}</p>}
        <p className="mt-2 text-lg font-bold text-[#C78F50]">{formatPrice(product.price, i18n.language)}</p>
        <button
          onClick={handleAdd}
          className="mt-3 rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-semibold text-[#010B1A] transition hover:bg-[#B37D3F]"
        >
          {t("productCard.addToOrder")}
        </button>
      </div>
    </div>
  );
}
