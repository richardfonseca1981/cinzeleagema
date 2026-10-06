import { useTranslation } from "react-i18next";
import { formatCents, type OrderTotals } from "../../lib/shipping/money";
import type { ShippingSummary } from "../../lib/shipping/summary";

interface OrderSummaryProps {
  totals: OrderTotals;
  summary: ShippingSummary;
  exchangeRate: number | null;
}

// Subtotal, Frete e Total — as parcelas SOMAM exatamente (centavos inteiros).
// Frete cotado: "Frete" e "Total". Sem valor de frete (a combinar, ou ainda
// não calculado): a linha do total vira "Total (sem frete)".
export function OrderSummary({ totals, summary, exchangeRate }: OrderSummaryProps) {
  const { t, i18n } = useTranslation();
  const money = (cents: number) => formatCents(cents, i18n.language, exchangeRate);

  const quoted = summary.kind === "quoted";
  const taxes = summary.kind !== "none" && (summary.kind === "quoted" ? summary.taxesNotIncluded : summary.international);

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4" data-testid="order-summary">
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-[#64748B]">{t("shipping.summary.subtotal")}</dt>
          <dd className="font-medium text-[#1A1A1A]">{money(totals.subtotalCents)}</dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="text-[#64748B]">{t("shipping.summary.shipping")}</dt>
          <dd className="text-right font-medium text-[#1A1A1A]" data-testid="summary-shipping">
            {totals.shippingCents !== null
              ? money(totals.shippingCents)
              : summary.kind === "arrange"
                ? t("shipping.summary.toArrange")
                : t("shipping.summary.notCalculated")}
          </dd>
        </div>
        <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-3 text-base">
          <dt className="font-semibold text-[#1A1A1A]">{quoted ? t("shipping.summary.total") : t("shipping.summary.totalWithoutShipping")}</dt>
          <dd className="text-xl font-bold text-[#C78F50]" data-testid="summary-total">
            {money(totals.totalCents)}
          </dd>
        </div>
      </dl>
      {summary.kind === "arrange" && (
        <p className="mt-2 text-xs text-[#64748B]" data-testid="arrange-hint">
          {t(`shipping.summary.arrangeHint.${summary.reason}`)}
        </p>
      )}
      {summary.kind !== "none" && !summary.fresh && (
        <p className="mt-2 text-xs text-[#64748B]" data-testid="recheck-hint">
          {t("shipping.summary.recheckHint")}
        </p>
      )}
      {taxes && <p className="mt-1 text-xs text-[#64748B]">{t("shipping.taxesNotice")}</p>}
    </div>
  );
}
