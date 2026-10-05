import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCart } from "../lib/cart";
import { formatPrice, formatWeightSize, localizeText } from "../lib/format";
import { computeOrderTotals, formatCents } from "../lib/shipping/money";
import { shippingAmountBRL } from "../lib/shipping/summary";
import { useShippingController } from "../lib/shipping/useShippingController";
import { OrderSummary } from "../components/shipping/OrderSummary";
import { ShippingCalculator } from "../components/shipping/ShippingCalculator";
import { useExchangeRate } from "../lib/exchangeRate";
import { PublicHeader } from "../components/landing/PublicHeader";
import { WhatsAppFloatingButton } from "../components/landing/WhatsAppFloatingButton";
import { WHATSAPP_HREF } from "../lib/whatsapp";
import { ProductImage } from "../components/ProductImage";

export function Cart() {
  const { t, i18n } = useTranslation();
  const { items, removeItem, updateQuantity } = useCart();
  const navigate = useNavigate();
  const exchangeRate = useExchangeRate();
  const shipping = useShippingController(items);
  // Subtotal, frete e total somam exatamente (centavos inteiros já arredondados).
  const totals = computeOrderTotals(
    items.map((i) => i.unitPrice * i.quantity),
    shippingAmountBRL(shipping.summary),
    i18n.language,
    exchangeRate
  );

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
            <div id="cart-items" className="mt-6 divide-y divide-[#E2E8F0] rounded-lg border border-[#E2E8F0] bg-white">
              {items.map((item, index) => {
                const itemName = localizeText(item.name, item.nameEn, i18n.language);
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
                      {formatCents(totals.lineCents[index], i18n.language, exchangeRate)}
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

            <ShippingCalculator controller={shipping} items={items} exchangeRate={exchangeRate} />

            <div className="mt-6">
              <OrderSummary totals={totals} summary={shipping.summary} exchangeRate={exchangeRate} />
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
