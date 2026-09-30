import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useCart } from "../lib/cart";
import { api } from "../lib/api";
import { formatPrice, formatWeightSize, localizeText } from "../lib/format";
import { normalizePhone, sanitizePhoneInput } from "../lib/phone";
import { PublicHeader } from "../components/landing/PublicHeader";
import { WhatsAppFloatingButton } from "../components/landing/WhatsAppFloatingButton";
import { WHATSAPP_HREF } from "../lib/whatsapp";
import type { CartItem } from "../types";

const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER;

function buildWhatsAppMessage(
  t: TFunction,
  lang: string,
  items: CartItem[],
  totalEstimate: number,
  customerName: string,
  customerPhone: string
) {
  const lines = [
    t("checkout.whatsappMessage.intro"),
    ...items.map((item) => {
      const name = localizeText(item.name, item.nameEn, lang);
      const price = formatPrice(item.unitPrice * item.quantity, lang);
      const size = formatWeightSize(item.weightGrams, item.sizeCm, lang);
      return size
        ? t("checkout.whatsappMessage.itemWithSize", { quantity: item.quantity, name, size, price })
        : t("checkout.whatsappMessage.item", { quantity: item.quantity, name, price });
    }),
    t("checkout.whatsappMessage.total", { total: formatPrice(totalEstimate, lang) }),
    t("checkout.whatsappMessage.name", { name: customerName }),
    t("checkout.whatsappMessage.phone", { phone: customerPhone }),
  ];
  return lines.join("\n");
}

export function Checkout() {
  const { t, i18n } = useTranslation();
  const { items, totalEstimate, clear } = useCart();
  const navigate = useNavigate();
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
        const message = buildWhatsAppMessage(t, i18n.language, items, totalEstimate, customerName, normalizedPhone);
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
          <h1 className="text-2xl font-bold text-[#1B3A6B]">{t("checkout.successTitle")}</h1>
          <p className="mt-3 text-[#64748B]">
            {sentVia === "fluxiodesk" ? t("checkout.successFluxio") : t("checkout.successWhatsapp")}
          </p>
          <button
            onClick={() => navigate("/catalogo")}
            className="mt-6 rounded-lg bg-[#1B3A6B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#152D54]"
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
          <div className="mt-3 flex items-center justify-between border-t border-[#E2E8F0] pt-3 font-semibold">
            <span>{t("checkout.total")}</span>
            <span className="text-[#1B3A6B]">{formatPrice(totalEstimate, i18n.language)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-[#E2E8F0] bg-white p-4">
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A]">{t("checkout.nameLabel")}</label>
            <input
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 outline-none transition focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]"
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
            className="w-full rounded-lg bg-[#1B3A6B] px-4 py-3 font-semibold text-white transition hover:bg-[#152D54] disabled:opacity-50"
          >
            {sending ? t("checkout.sending") : t("checkout.submit")}
          </button>
        </form>
      </div>
      <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
    </div>
  );
}
