import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCart } from "../lib/cart";
import { api } from "../lib/api";
import { formatWeightSize, localizeText } from "../lib/format";
import { cartSignature } from "../lib/shipping/cartSignature";
import { computeOrderTotals } from "../lib/shipping/money";
import { loadStoredShipping } from "../lib/shipping/storage";
import { destinationFor, resolveShippingSummary, shippingAmountBRL } from "../lib/shipping/summary";
import { buildWhatsAppMessage } from "../lib/shipping/whatsappMessage";
import { OrderSummary } from "../components/shipping/OrderSummary";
import { useExchangeRate, useExchangeRateInfo } from "../lib/exchangeRate";
import { isRateApproximate } from "../lib/exchangeRateQuality";
import { normalizePhone, sanitizePhoneInput } from "../lib/phone";
import { PublicHeader } from "../components/landing/PublicHeader";
import { WhatsAppFloatingButton } from "../components/landing/WhatsAppFloatingButton";
import { WHATSAPP_HREF } from "../lib/whatsapp";

const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER;

export function Checkout() {
  const { t, i18n } = useTranslation();
  const { items, totalEstimate, clear } = useCart();
  const navigate = useNavigate();
  const exchangeRate = useExchangeRate();
  const exchangeRateInfo = useExchangeRateInfo();
  // O destino e a opção de frete vêm do carrinho (localStorage). Se o carrinho
  // mudou depois da cotação, ela venceu: aviso, mas o pedido nunca é bloqueado.
  const stored = useMemo(() => loadStoredShipping(), []);
  const summary = useMemo(() => resolveShippingSummary(stored, cartSignature(items), Date.now()), [stored, items]);
  const totals = computeOrderTotals(
    items.map((i) => i.unitPrice * i.quantity),
    shippingAmountBRL(summary),
    i18n.language,
    exchangeRate
  );
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [phoneError, setPhoneError] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentVia, setSentVia] = useState<"fluxiodesk" | "whatsapp" | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (items.length === 0) return;

    const normalizedPhone = normalizePhone(customerPhone);
    if (!normalizedPhone) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    setSending(true);

    const orderItems = items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));

    let delivered = false;
    try {
      const result = await api.createOrder({
        customerName,
        customerPhone: normalizedPhone,
        items: orderItems,
        totalEstimate,
      });
      delivered = result.delivered;
    } catch {
      delivered = false;
    }

    if (delivered) {
      clear();
      setSentVia("fluxiodesk");
    } else {
      if (WHATSAPP_NUMBER) {
        const message = buildWhatsAppMessage({
          t,
          lang: i18n.language,
          exchangeRate,
          items,
          summary,
          destination: destinationFor(stored, summary),
          customerName,
          customerPhone: normalizedPhone,
          rateApproximate: isRateApproximate(exchangeRateInfo, Date.now()),
        });
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      }
      clear();
      setSentVia("whatsapp");
    }

    setSending(false);
  }

  if (items.length === 0 && !sentVia) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
        <PublicHeader />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-[#64748B]">{t("checkout.emptyCart")}</p>
        </div>
        <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
      </div>
    );
  }

  if (sentVia) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
        <PublicHeader />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-[#C78F50]">{t("checkout.successTitle")}</h1>
          <p className="mt-3 text-[#64748B]">
            {sentVia === "fluxiodesk" ? t("checkout.successFluxio") : t("checkout.successWhatsapp")}
          </p>
          <button
            onClick={() => navigate("/catalogo")}
            className="mt-6 rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-semibold text-[#010B1A] transition hover:bg-[#B37D3F]"
          >
            {t("checkout.backToCatalog")}
          </button>
        </div>
        <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <PublicHeader />
      <div className="mx-auto max-w-lg px-4 py-8">
        <h1 className="text-2xl font-bold">{t("checkout.title")}</h1>
        <p className="mt-1 text-sm text-[#64748B]">{t("checkout.subtitle")}</p>

        <div className="mt-6 rounded-lg border border-[#E2E8F0] bg-white p-4">
          <p className="text-sm font-medium text-[#1A1A1A]">{t("checkout.summary")}</p>
          <ul className="mt-2 space-y-1 text-sm text-[#64748B]">
            {items.map((item) => {
              const itemName = localizeText(item.name, item.nameEn, i18n.language);
              const weightSize = formatWeightSize(item.weightGrams, item.sizeCm, i18n.language);
              return (
                <li key={item.productId}>
                  {item.quantity}x {itemName}
                  {weightSize && <span className="text-[#94A3B8]"> ({weightSize})</span>}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-4">
          <OrderSummary totals={totals} summary={summary} exchangeRate={exchangeRate} />
          {summary.kind === "stale" && (
            <p className="mt-2 rounded-lg border border-[#F59E0B] bg-[#FFFBEB] p-3 text-sm text-[#B45309]" role="status" data-testid="stale-warning">
              {t("shipping.summary.staleWarning")}{" "}
              <Link to="/carrinho" className="font-medium underline">
                {t("shipping.summary.recalculate")}
              </Link>
            </p>
          )}
          {summary.kind === "none" && (
            <p className="mt-2 text-sm">
              <Link to="/carrinho" className="text-[#64748B] underline underline-offset-2 hover:text-[#C78F50]">
                {t("shipping.summary.calculateInCart")}
              </Link>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-[#E2E8F0] bg-white p-4">
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A]">{t("checkout.nameLabel")}</label>
            <input
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 outline-none transition focus:border-[#C78F50] focus:ring-2 focus:ring-[#C78F50]/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A]">{t("checkout.phoneLabel")}</label>
            <input
              required
              type="tel"
              inputMode="tel"
              value={customerPhone}
              onChange={(e) => {
                setCustomerPhone(sanitizePhoneInput(e.target.value));
                if (phoneError) setPhoneError(false);
              }}
              placeholder={t("checkout.phonePlaceholder")}
              aria-invalid={phoneError}
              className={`mt-1 w-full rounded-lg border px-3 py-2 outline-none transition focus:ring-2 focus:ring-[#EFF6FF] ${
                phoneError ? "border-[#DC2626]" : "border-[#E2E8F0] focus:border-[#1B3A6B]"
              }`}
            />
            {phoneError && <p className="mt-1 text-sm text-[#DC2626]">{t("checkout.phoneError")}</p>}
          </div>
          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-lg bg-[#C78F50] px-4 py-3 font-semibold text-[#010B1A] transition hover:bg-[#B37D3F] disabled:opacity-50"
          >
            {sending ? t("checkout.sending") : t("checkout.submit")}
          </button>
        </form>
      </div>
      <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
    </div>
  );
}
