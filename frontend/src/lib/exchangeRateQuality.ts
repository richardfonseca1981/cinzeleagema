// A cotação USD->BRL vem de GET /api/exchange-rate como { rate, updatedAt }.
// O backend a mantém em cache por 24 h; se a busca falhar, serve o cache
// antigo COM o updatedAt antigo (dá para saber que está desatualizada). Já o
// fallback fixo de emergência (usado só quando nunca houve cache) é gravado
// com updatedAt = agora — indistinguível de uma cotação nova, então NÃO há
// como detectá-lo no frontend (limitação registrada no CONTEXT.md).
export const RATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// true só quando dá para PROVAR que a cotação tem mais de 24 horas.
// Data ausente ou inválida = não dá para saber = false.
export function isRateStale(updatedAt: string | null | undefined, now: number): boolean {
  if (!updatedAt) return false;
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time)) return false;
  return now - time > RATE_MAX_AGE_MS;
}

const rateFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

// 2 casas decimais, ponto decimal: 5.3 → "5.30", 5.3249 → "5.32", 5.325 → "5.33".
export function formatRateForMessage(rate: number): string {
  return rateFormatter.format(rate);
}
