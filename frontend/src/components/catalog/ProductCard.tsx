import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Product } from "../../types";
import { formatPrice, localizeText } from "../../lib/format";
import { useCart } from "../../lib/cart";
import { useExchangeRate } from "../../lib/exchangeRate";
import { useToast } from "../Toast";
import { ProductImage } from "../ProductImage";
import { CATALOG_CARD } from "../../lib/catalogCard";

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const { t, i18n } = useTranslation();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const exchangeRate = useExchangeRate();
  const image = product.images[0]?.url ?? null;
  const displayName = localizeText(product.name, product.nameEn, i18n.language);

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
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm transition hover:shadow-md">
      <Link to={`/catalogo/${product.id}`} className="block">
        <ProductImage
          src={image}
          alt={displayName}
          aspectRatio={CATALOG_CARD.aspectRatio}
          fit={CATALOG_CARD.fit}
          priority={priority}
        />
      </Link>
      {/* Nome (até 2 linhas, altura reservada), preço e botão: cards da mesma linha ficam com a mesma altura. */}
      <div className="flex flex-1 flex-col p-2.5 sm:p-4">
        <Link to={`/catalogo/${product.id}`}>
          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5 text-[#1A1A1A] transition hover:text-[#5F84BA] sm:text-base sm:leading-5">
            {displayName}
          </h3>
        </Link>
        <p className="mb-2 mt-1 text-base font-bold text-[#C78F50] sm:text-lg">{formatPrice(product.price, i18n.language, exchangeRate)}</p>
        <button
          onClick={handleAdd}
          className="mt-auto rounded-lg bg-[#C78F50] px-2 py-2 text-xs font-semibold text-[#010B1A] transition hover:bg-[#B37D3F] sm:px-4 sm:text-sm"
        >
          {t("productCard.addToOrder")}
        </button>
      </div>
    </div>
  );
}
