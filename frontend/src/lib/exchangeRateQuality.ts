// A cotação USD->BRL vem de GET /api/exchange-rate como
// { rate, updatedAt, source }. `source` diz a ORIGEM:
//  - "live": consulta externa nas últimas 24 h;
//  - "stale": a consulta falhou e o valor tem mais de 24 h;
//  - "fallback": valor de emergência do backend.
// Backend antigo (ou resposta em cache do navegador) pode não trazer `source`:
// nesse caso vale só a regra da idade pelo updatedAt.
export type RateSource = "live" | "stale" | "fallback";

export function parseRateSource(value: unknown): RateSource | null {
  return value === "live" || value === "stale" || value === "fallback" ? value : null;
}

export const RATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// true só quando dá para PROVAR que a cotação tem mais de 24 horas.
// Data ausente ou inválida = não dá para saber = false.
export function isRateStale(updatedAt: string | null | undefined, now: number): boolean {
  if (!updatedAt) return false;
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time)) return false;
  return now - time > RATE_MAX_AGE_MS;
}

// Cotação "aproximada" (linha "(approximate rate)"): origem "stale" ou
// "fallback", OU mais de 24 h pelo updatedAt. Sem `source` (compatibilidade),
// valem só as regras de idade; sem nenhuma informação, não dá para saber → false.
export function isRateApproximate(
  info: { updatedAt?: string | null; source?: RateSource | null } | null | undefined,
  now: number
): boolean {
  if (!info) return false;
  if (info.source === "stale" || info.source === "fallback") return true;
  return isRateStale(info.updatedAt, now);
}

const rateFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

// 2 casas decimais, ponto decimal: 5.3 → "5.30", 5.3249 → "5.32", 5.325 → "5.33".
export function formatRateForMessage(rate: number): string {
  return rateFormatter.format(rate);
}
