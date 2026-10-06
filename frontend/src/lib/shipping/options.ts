import type { TFunction } from "i18next";
import type { ShippingOption, ShippingQuoteResult } from "./types";

// Prazos nulos nunca "ganham": sem informação = infinito. Se só um dos limites
// vier, ele vale para os dois.
function maxDays(o: ShippingOption): number {
  return o.deliveryDaysMax ?? o.deliveryDaysMin ?? Number.POSITIVE_INFINITY;
}
function minDays(o: ShippingOption): number {
  return o.deliveryDaysMin ?? o.deliveryDaysMax ?? Number.POSITIVE_INFINITY;
}

// Preço, e em empate o menor prazo máximo, depois o menor prazo mínimo.
function comparePrice(a: ShippingOption, b: ShippingOption): number {
  return a.priceBRL - b.priceBRL || cmp(maxDays(a), maxDays(b)) || cmp(minDays(a), minDays(b));
}
// Menor prazo máximo, e em empate o menor preço, depois o menor prazo mínimo.
function compareSpeed(a: ShippingOption, b: ShippingOption): number {
  return cmp(maxDays(a), maxDays(b)) || a.priceBRL - b.priceBRL || cmp(minDays(a), minDays(b));
}
// Infinity - Infinity = NaN: compara sem subtrair.
function cmp(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function sortedBy(options: ShippingOption[], compare: (a: ShippingOption, b: ShippingOption) => number): ShippingOption[] {
  // índice como último desempate: ordenação estável e previsível
  return options
    .map((option, index) => ({ option, index }))
    .sort((x, y) => compare(x.option, y.option) || x.index - y.index)
    .map((x) => x.option);
}

// Opção pré-selecionada: a mais barata (desempate pelo prazo).
export function cheapestOption(options: ShippingOption[]): ShippingOption | null {
  return sortedBy(options, comparePrice)[0] ?? null;
}

export interface Badges {
  cheapestId: string | null;
  fastestId: string | null;
}

// Selos "Mais barato" / "Mais rápido": só com mais de uma opção, e só quando o
// vencedor é de fato melhor que outra opção naquele critério — sem selo
// "artificial" em empate total.
export function pickBadges(options: ShippingOption[]): Badges {
  const none: Badges = { cheapestId: null, fastestId: null };
  if (options.length < 2) return none;

  const byPrice = sortedBy(options, comparePrice);
  const cheapest = byPrice[0];
  const cheapestWins =
    options.some((o) => o.priceBRL > cheapest.priceBRL) && comparePrice(cheapest, byPrice[1]) !== 0;

  const bySpeed = sortedBy(options, compareSpeed);
  const fastest = bySpeed[0];
  const fastestKnown = Number.isFinite(maxDays(fastest));
  const fastestWins =
    fastestKnown &&
    options.some((o) => Number.isFinite(maxDays(o)) && maxDays(o) > maxDays(fastest)) &&
    compareSpeed(fastest, bySpeed[1]) !== 0;

  return { cheapestId: cheapestWins ? cheapest.id : null, fastestId: fastestWins ? fastest.id : null };
}

// "5 a 8 dias", "5 dias", "1 dia" — ou null quando o prazo é desconhecido.
// Só "dias": a unidade (corridos × úteis) não foi confirmada na documentação.
export function deliveryRangeText(t: TFunction, min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  const a = min ?? (max as number);
  const b = max ?? (min as number);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo === hi) return t("shipping.delivery.days", { count: lo });
  return t("shipping.delivery.range", { min: lo, max: hi });
}

// Seleção depois de uma cotação nova: mantém a escolha anterior se ela ainda
// existe; senão a mais barata. Sem opções (indisponível): nada selecionado —
// o "a combinar" nunca é uma escolha de opção, vem do motivo da indisponibilidade.
export function selectionAfterQuote(result: ShippingQuoteResult, previous: string | null): string | null {
  if (result.unavailable) return null;
  if (previous && result.options.some((o) => o.id === previous)) return previous;
  return cheapestOption(result.options)?.id ?? null;
}

// "Correios — PAC". No exterior o serviço é um nome só cadastrado pelo cliente
// (carrier e service iguais): mostra uma vez só.
export function optionLabel(option: Pick<ShippingOption, "carrier" | "service">): string {
  return !option.carrier || option.carrier === option.service ? option.service : `${option.carrier} — ${option.service}`;
}
