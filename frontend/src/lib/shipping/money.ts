// Valores exibidos com a mesma convenção do resto do site: preços cadastrados
// em Real; em inglês, convertidos para dólar com a cotação do dia (se ela
// estiver indisponível, cai para Real). Tudo é calculado em CENTAVOS inteiros
// já arredondados, e o total é a SOMA das parcelas exibidas — a tela nunca
// mostra um total que difere por centavos do subtotal + frete.

export function usesDollars(lang: string, rate: number | null | undefined): boolean {
  return lang === "en" && typeof rate === "number" && rate > 0;
}

export function toDisplayCents(amountBRL: number, lang: string, rate: number | null | undefined): number {
  const value = usesDollars(lang, rate) ? amountBRL / (rate as number) : amountBRL;
  return Math.round((value + Number.EPSILON) * 100);
}

export function formatCents(cents: number, lang: string, rate: number | null | undefined): string {
  const amount = cents / 100;
  if (usesDollars(lang, rate)) return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return amount.toLocaleString(lang === "en" ? "en-US" : "pt-BR", { style: "currency", currency: "BRL" });
}

export interface OrderTotals {
  lineCents: number[];
  subtotalCents: number;
  shippingCents: number | null;
  totalCents: number;
}

// lineTotalsBRL: total de cada linha do carrinho (preço unitário × quantidade).
export function computeOrderTotals(
  lineTotalsBRL: number[],
  shippingBRL: number | null,
  lang: string,
  rate: number | null | undefined
): OrderTotals {
  const lineCents = lineTotalsBRL.map((v) => toDisplayCents(v, lang, rate));
  const subtotalCents = lineCents.reduce((a, b) => a + b, 0);
  const shippingCents = shippingBRL === null ? null : toDisplayCents(shippingBRL, lang, rate);
  return { lineCents, subtotalCents, shippingCents, totalCents: subtotalCents + (shippingCents ?? 0) };
}
