import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCart } from "../lib/cart";
import { api } from "../lib/api";
import { formatWeightSize, localizeText } from "../lib/format";
import { cartSignature } from "../lib/shipping/cartSignature";
import {
  confirmShipping,
  destinationState,
  withArrangeChoice,
  type ShippingChange,
} from "../lib/shipping/confirmFlow";
import { QUOTE_TIMEOUT_MS, RATE_LIMIT_COOLDOWN_MS, describeIssue } from "../lib/shipping/errors";
import { computeOrderTotals, formatCents, toDisplayCents } from "../lib/shipping/money";
import { optionLabel } from "../lib/shipping/options";
import { emptyStoredShipping, loadStoredShipping, saveStoredShipping, type StoredShipping } from "../lib/shipping/storage";
import {
  destinationFor,
  resolveShippingSummary,
  shippingAmountBRL,
  type UsableShippingSummary,
} from "../lib/shipping/summary";
import type { ShippingQuoteRequest, TechnicalCause } from "../lib/shipping/types";
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
  // O destino e a opção de frete vêm do carrinho (localStorage). O pedido só é
  // confirmado com frete cotado e válido (menos de 10 minutos, mesmo carrinho)
  // ou "a combinar" permitido; senão, o frete é recalculado no clique de
  // confirmar, antes de abrir o WhatsApp.
  const [stored, setStored] = useState<StoredShipping>(() => loadStoredShipping() ?? emptyStoredShipping());
  const signature = cartSignature(items);
  const summary = useMemo(() => resolveShippingSummary(stored, signature, Date.now()), [stored, signature]);
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
  const [checking, setChecking] = useState(false);
  const [sentVia, setSentVia] = useState<"fluxiodesk" | "whatsapp" | null>(null);
  // O que o recálculo do frete encontrou (nada disso abre o WhatsApp)
  const [change, setChange] = useState<ShippingChange | null>(null);
  const [failure, setFailure] = useState<TechnicalCause | null>(null);
  const [blocked, setBlocked] = useState<"invalid_destination" | "product_unavailable" | null>(null);
  const [needsDestination, setNeedsDestination] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const requestRef = useRef(0);

  // Contagem do "Tentar de novo" depois de um 429
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    setNow(Date.now());
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= cooldownUntil) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);
  const cooldownSecondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => () => void (requestRef.current += 1), []);

  const money = (brl: number) => formatCents(toDisplayCents(brl, i18n.language, exchangeRate), i18n.language, exchangeRate);

  function updateStored(next: StoredShipping) {
    setStored(next);
    saveStoredShipping(next);
  }

  function resetShippingMessages() {
    setChange(null);
    setFailure(null);
    setBlocked(null);
    setNeedsDestination(false);
  }

  async function fetchQuote(request: ShippingQuoteRequest) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
    try {
      return await api.getShippingQuote(request, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (items.length === 0) return;

    const normalizedPhone = normalizePhone(customerPhone);
    if (!normalizedPhone) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    await confirm(normalizedPhone);
  }

  // Clique de confirmar (e "Tentar de novo"): confere o frete ANTES de abrir o WhatsApp.
  async function confirm(phone: string) {
    resetShippingMessages();
    const requestId = ++requestRef.current;
    setChecking(true);

    const outcome = await confirmShipping(stored, items, {
      fetchQuote,
      now: Date.now,
      isCurrent: () => requestRef.current === requestId,
    });
    if (requestRef.current !== requestId || outcome.type === "discarded") return; // resposta atrasada
    setChecking(false);

    switch (outcome.type) {
      case "send":
        updateStored(outcome.stored);
        await submitOrder(outcome.stored, outcome.summary, phone);
        break;
      case "changed":
        // frete diferente do que estava na tela: mostra e exige um novo clique
        updateStored(outcome.stored);
        setChange(outcome.change);
        break;
      case "technical_failure":
        setFailure(outcome.cause);
        if (outcome.cause === "rate_limited") setCooldownUntil(Date.now() + RATE_LIMIT_COOLDOWN_MS);
        break;
      case "blocked":
        setBlocked(outcome.issue.type);
        break;
      case "needs_destination":
        setNeedsDestination(true);
        break;
    }
  }

  // "Fechar o pedido com frete a combinar": escolha explícita do comprador
  // depois de ver a falha técnica.
  async function closeWithArrangedShipping() {
    const phone = normalizePhone(customerPhone);
    if (!failure || !phone) return;
    const next = withArrangeChoice(stored, signature, failure, Date.now());
    updateStored(next);
    resetShippingMessages();
    await submitOrder(next, { kind: "arrange", reason: "technical_choice", international: next.country !== "BR", fresh: true }, phone);
  }

  async function submitOrder(finalStored: StoredShipping, finalSummary: UsableShippingSummary, normalizedPhone: string) {
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
          summary: finalSummary,
          destination: destinationFor(finalStored, finalSummary),
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

  const canQuoteHere = destinationState(stored.country, stored.postalCode) === "complete";
  // Sem frete utilizável e sem destino para calcular: só o carrinho resolve.
  const mustGoToCart = summary.kind === "none" && !canQuoteHere;
  const issueMessage = failure ? describeIssue({ type: "technical", cause: failure }) : null;

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
          {summary.kind === "none" && canQuoteHere && (
            <p className="mt-2 text-sm text-[#64748B]" data-testid="will-quote">
              {t("checkout.willQuoteShipping")}
            </p>
          )}
          {(mustGoToCart || needsDestination) && (
            <p className="mt-2 text-sm" data-testid="needs-destination">
              <span className="text-[#64748B]">{t("checkout.needsDestination")} </span>
              <Link to="/carrinho" className="font-medium text-[#C78F50] underline underline-offset-2">
                {t("shipping.summary.calculateInCart")}
              </Link>
            </p>
          )}
          {blocked && (
            <p className="mt-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-sm text-[#991B1B]" role="alert" data-testid="blocked-message">
              {t(describeIssue({ type: blocked }).messageKey)}{" "}
              <Link to="/carrinho" className="font-medium underline">
                {t("shipping.summary.backToCart")}
              </Link>
            </p>
          )}
          {change && (
            <p className="mt-2 rounded-lg border border-[#F59E0B] bg-[#FFFBEB] p-3 text-sm text-[#B45309]" role="status" data-testid="shipping-changed">
              {change.kind === "price"
                ? t("checkout.shippingChanged.price", { from: money(change.fromBRL), to: money(change.toBRL) })
                : change.kind === "calculated"
                  ? t("checkout.shippingChanged.calculated", { service: optionLabel(change.label), price: money(change.toBRL) })
                  : t("checkout.shippingChanged.arrange", { reason: t(`shipping.summary.arrangeHint.${change.reason}`) })}
            </p>
          )}
          {failure && issueMessage && (
            <div className="mt-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-sm text-[#991B1B]" role="alert" data-testid="shipping-failure">
              <p>{t(issueMessage.messageKey)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void confirm(normalizePhone(customerPhone) ?? "")}
                  disabled={checking || sending || cooldownSecondsLeft > 0}
                  className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#F8FAFC] disabled:opacity-50"
                  data-testid="shipping-action-retry"
                >
                  {cooldownSecondsLeft > 0 ? t("shipping.actions.retryIn", { seconds: cooldownSecondsLeft }) : t("shipping.actions.retry")}
                </button>
                <button
                  type="button"
                  onClick={() => void closeWithArrangedShipping()}
                  disabled={checking || sending}
                  className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#F8FAFC] disabled:opacity-50"
                  data-testid="shipping-action-closeArranged"
                >
                  {t("shipping.actions.closeArranged")}
                </button>
              </div>
            </div>
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
            disabled={sending || checking || mustGoToCart || failure !== null || blocked !== null}
            className="w-full rounded-lg bg-[#C78F50] px-4 py-3 font-semibold text-[#010B1A] transition hover:bg-[#B37D3F] disabled:opacity-50"
          >
            {checking ? t("checkout.checkingShipping") : sending ? t("checkout.sending") : t("checkout.submit")}
          </button>
        </form>
      </div>
      <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
    </div>
  );
}
