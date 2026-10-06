import type { TFunction } from "i18next";
import type { CartItem } from "../../types";
import { formatWeightSize, localizeText } from "../format";
import { countryName } from "./countries";
import { deliveryRangeText, optionLabel } from "./options";
import { formatRateForMessage } from "../exchangeRateQuality";
import { computeOrderTotals, formatCents, usesDollars } from "./money";
import { formatPostalCode } from "./postalCode";
import { shippingAmountBRL, type MessageDestination, type UsableShippingSummary } from "./summary";

export interface WhatsAppMessageInput {
  t: TFunction;
  lang: string;
  exchangeRate: number | null;
  items: CartItem[];
  // O pedido só chega aqui com frete cotado ou "a combinar" permitido.
  summary: UsableShippingSummary;
  destination: MessageDestination | null;
  customerName: string;
  customerPhone: string;
  // true quando a cotação é aproximada: origem "stale"/"fallback" ou mais de
  // 24 h (ver isRateApproximate em exchangeRateQuality.ts)
  rateApproximate?: boolean;
}

function destinationLine(t: TFunction, lang: string, d: MessageDestination): string {
  const parts = [countryName(d.country, lang)];
  const postal = formatPostalCode(d.country, d.postalCode);
  if (postal) parts.push(t(d.country === "BR" ? "checkout.whatsappMessage.postalCodeBr" : "checkout.whatsappMessage.postalCode", { code: postal }));
  let place = parts.join(", ");
  if (d.city) place += ` — ${d.state ? `${d.city}, ${d.state}` : d.city}`;
  return t("checkout.whatsappMessage.destination", { place });
}

// Mensagem enviada ao WhatsApp. Em português os valores saem em R$; em inglês,
// em dólar (mesma conversão e cotação do resto do site) — com subtotal, frete
// e total somando exatamente (centavos inteiros já arredondados).
export function buildWhatsAppMessage(input: WhatsAppMessageInput): string {
  const { t, lang, exchangeRate: rate, items, summary, destination } = input;
  const money = (cents: number) => formatCents(cents, lang, rate);

  const totals = computeOrderTotals(
    items.map((i) => i.unitPrice * i.quantity),
    shippingAmountBRL(summary),
    lang,
    rate
  );

  const itemLines = items.map((item, index) => {
    const name = localizeText(item.name, item.nameEn, lang);
    const price = money(totals.lineCents[index]);
    const size = formatWeightSize(item.weightGrams, item.sizeCm, lang);
    return size
      ? t("checkout.whatsappMessage.itemWithSize", { quantity: item.quantity, name, size, price })
      : t("checkout.whatsappMessage.item", { quantity: item.quantity, name, price });
  });

  const lines: string[] = [t("checkout.whatsappMessage.intro"), ...itemLines];
  lines.push(t("checkout.whatsappMessage.subtotal", { amount: money(totals.subtotalCents) }));

  if (destination) lines.push(destinationLine(t, lang, destination));

  if (summary.kind === "quoted") {
    const { option } = summary;
    const days = deliveryRangeText(t, option.deliveryDaysMin, option.deliveryDaysMax);
    const params = { service: optionLabel(option), price: money(totals.shippingCents ?? 0), days: days ?? "" };
    // Frete definitivo: serviço, preço e prazo — nada de "a confirmar".
    lines.push(t(days ? "checkout.whatsappMessage.shippingWithDays" : "checkout.whatsappMessage.shipping", params));
    if (summary.taxesNotIncluded) lines.push(t("checkout.whatsappMessage.taxes"));
    lines.push(t("checkout.whatsappMessage.totalWithShipping", { total: money(totals.totalCents) }));
  } else {
    lines.push(t("checkout.whatsappMessage.shippingArrange", { reason: t(`checkout.whatsappMessage.arrangeReason.${summary.reason}`) }));
    if (summary.international) lines.push(t("checkout.whatsappMessage.taxes"));
    lines.push(t("checkout.whatsappMessage.totalWithoutShipping", { total: money(totals.totalCents) }));
  }

  lines.push(t("checkout.whatsappMessage.name", { name: input.customerName }));
  lines.push(t("checkout.whatsappMessage.phone", { phone: input.customerPhone }));

  // Última linha, só informativa: SOMENTE em inglês e SOMENTE quando a conversão
  // para dólar foi de fato aplicada aos valores acima (mesma `usesDollars` e a
  // MESMA cotação `rate` que converteu os valores — nenhuma consulta nova).
  // Em português, ou se a mensagem saiu em reais, não há linha.
  if (usesDollars(lang, rate)) {
    const key = input.rateApproximate ? "checkout.whatsappMessage.exchangeRateApprox" : "checkout.whatsappMessage.exchangeRate";
    lines.push("", t(key, { rate: formatRateForMessage(rate as number) }));
  }
  return lines.join("\n");
}
