import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Product } from "../../types";
import { formatPrice, formatWeightSize, localizeProductName } from "../../lib/format";
import { buildPriceInquiryHref } from "../../lib/whatsapp";
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
  const displayName = localizeProductName(product, i18n.language, t);
  const weightSize = formatWeightSize(product.weightGrams, product.sizeCm, i18n.language);
  // Preço null = "Consulte o valor" — nunca entra em carrinho/total, diferente
  // de preço 0 (promocional/simbólico, que segue o fluxo normal).
  const { price } = product;
  const priceInquiryHref = price === null ? buildPriceInquiryHref(t("priceInquiry.message", { name: displayName })) : null;

  function handleAdd() {
    if (price === null) return;
    addItem({
      productId: product.id,
      name: product.name,
      nameEn: product.nameEn,
      sku: product.sku,
      unitPrice: Number(price),
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
        {weightSize && <p className="mt-1 text-xs text-[#94A3B8]">{weightSize}</p>}
        <p className="mb-2 mt-1 text-base font-bold text-[#C78F50] sm:text-lg">
          {price !== null ? formatPrice(price, i18n.language, exchangeRate) : t("productCard.priceOnRequest")}
        </p>
        {price !== null ? (
          <button
            onClick={handleAdd}
            className="mt-auto rounded-lg bg-[#C78F50] px-2 py-2 text-xs font-semibold text-[#010B1A] transition hover:bg-[#B37D3F] sm:px-4 sm:text-sm"
          >
            {t("productCard.addToOrder")}
          </button>
        ) : priceInquiryHref ? (
          <a
            href={priceInquiryHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto rounded-lg border border-[#C78F50] px-2 py-2 text-center text-xs font-semibold text-[#C78F50] transition hover:bg-[#C78F50]/10 sm:px-4 sm:text-sm"
          >
            {t("productCard.askPrice")}
          </a>
        ) : null}
      </div>
    </div>
  );
}
