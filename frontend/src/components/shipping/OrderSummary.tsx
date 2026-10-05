import { useTranslation } from "react-i18next";
import { formatCents, type OrderTotals } from "../../lib/shipping/money";
import type { ShippingSummary } from "../../lib/shipping/summary";

interface OrderSummaryProps {
  totals: OrderTotals;
  summary: ShippingSummary;
  exchangeRate: number | null;
}

// Subtotal, Frete e Total — as parcelas SOMAM exatamente (centavos inteiros).
// O frete nunca bloqueia nada: sem cotação aparece "A combinar".
export function OrderSummary({ totals, summary, exchangeRate }: OrderSummaryProps) {
  const { t, i18n } = useTranslation();
  const money = (cents: number) => formatCents(cents, i18n.language, exchangeRate);

  const isEstimated = summary.kind === "estimated";
  const hasAmount = totals.shippingCents !== null;
  const international = summary.kind !== "none" && summary.international;
  const taxes = summary.kind === "quoted" || summary.kind === "estimated" ? summary.taxesNotIncluded : international;

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4" data-testid="order-summary">
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-[#64748B]">{t("shipping.summary.subtotal")}</dt>
          <dd className="font-medium text-[#1A1A1A]">{money(totals.subtotalCents)}</dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="text-[#64748B]">{t("shipping.summary.shipping")}</dt>
          <dd className="text-right font-medium text-[#1A1A1A]">
            {hasAmount ? money(totals.shippingCents as number) : t("shipping.summary.toArrange")}
            {isEstimated && <span className="block text-xs font-normal text-[#B45309]">{t("shipping.summary.estimateToConfirm")}</span>}
          </dd>
        </div>
        <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-3 text-base">
          <dt className="font-semibold text-[#1A1A1A]">
            {hasAmount && !isEstimated ? t("shipping.summary.total") : t("shipping.summary.totalEstimated")}
          </dt>
          <dd className="text-xl font-bold text-[#C78F50]">{money(totals.totalCents)}</dd>
        </div>
      </dl>
      {isEstimated && <p className="mt-2 text-xs text-[#64748B]">{t("shipping.summary.estimatedHint")}</p>}
      {!hasAmount && <p className="mt-2 text-xs text-[#64748B]">{t("shipping.summary.arrangeHint")}</p>}
      {taxes && <p className="mt-1 text-xs text-[#64748B]">{t("shipping.taxesNotice")}</p>}
    </div>
  );
}
