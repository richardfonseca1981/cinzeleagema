import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCart } from "../lib/cart";
import { formatPrice, formatWeightSize, localizeProductName } from "../lib/format";
import { useExchangeRate } from "../lib/exchangeRate";
import { PublicHeader } from "../components/landing/PublicHeader";
import { WhatsAppFloatingButton } from "../components/landing/WhatsAppFloatingButton";
import { WHATSAPP_HREF } from "../lib/whatsapp";
import { ProductImage } from "../components/ProductImage";

export function Cart() {
  const { t, i18n } = useTranslation();
  const { items, removeItem, updateQuantity, totalEstimate } = useCart();
  const navigate = useNavigate();
  const exchangeRate = useExchangeRate();

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">{t("cart.title")}</h1>

        {items.length === 0 ? (
          <div className="mt-6 rounded-lg border border-[#E2E8F0] bg-white p-8 text-center">
            <p className="text-[#64748B]">{t("cart.empty")}</p>
            <Link
              to="/catalogo"
              className="mt-4 inline-block rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-semibold text-[#010B1A] transition hover:bg-[#B37D3F]"
            >
              {t("cart.viewCatalog")}
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 divide-y divide-[#E2E8F0] rounded-lg border border-[#E2E8F0] bg-white">
              {items.map((item) => {
                const itemName = localizeProductName(item, i18n.language, t);
                const weightSize = formatWeightSize(item.weightGrams, item.sizeCm, i18n.language);

                return (
                  <div key={item.productId} className="flex flex-wrap items-center gap-4 p-4">
                    <ProductImage variant="thumb" src={item.imageUrl} alt={itemName} />
                    <div className="min-w-[140px] flex-1">
                      <p className="font-medium text-[#1A1A1A]">{itemName}</p>
                      {weightSize && <p className="text-xs text-[#94A3B8]">{weightSize}</p>}
                      <p className="text-sm text-[#64748B]">
                        {formatPrice(item.unitPrice, i18n.language, exchangeRate)} {t("cart.perUnit")}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.productId, Math.max(1, Number(e.target.value)))}
                      className="w-16 rounded-lg border border-[#E2E8F0] px-2 py-1 text-center text-sm outline-none transition focus:border-[#C78F50] focus:ring-2 focus:ring-[#C78F50]/20"
                    />
                    <p className="w-24 text-right font-semibold text-[#1A1A1A]">
                      {formatPrice(item.unitPrice * item.quantity, i18n.language, exchangeRate)}
                    </p>
                    <button
                      onClick={() => removeItem(item.productId)}
                      className="text-sm text-[#64748B] transition hover:text-[#DC2626]"
                    >
                      {t("cart.remove")}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-white p-4">
              <span className="font-medium">{t("cart.total")}</span>
              <span className="text-xl font-bold text-[#C78F50]">{formatPrice(totalEstimate, i18n.language, exchangeRate)}</span>
            </div>

            <button
              onClick={() => navigate("/finalizar")}
              className="mt-6 w-full rounded-lg bg-[#C78F50] px-4 py-3 font-semibold text-[#010B1A] transition hover:bg-[#B37D3F]"
            >
              {t("cart.checkout")}
            </button>
          </>
        )}
      </div>
      <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
    </div>
  );
}
