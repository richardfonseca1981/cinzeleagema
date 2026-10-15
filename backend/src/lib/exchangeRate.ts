const EXCHANGE_API_URL = "https://open.er-api.com/v6/latest/USD";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // a API pública atualiza a cotação a cada 24h

// Fallback de emergência — só é usado se NUNCA houve cache em memória e a
// busca na API falhar (primeira chamada após o boot, sem internet/API fora
// do ar). Valor aproximado, revisar periodicamente.
const FALLBACK_RATE = 5.3;

// O valor de emergência NÃO vale como cotação fresca por 24 h: depois deste
// intervalo curto tenta-se a API externa de novo (e não a cada requisição).
export const FALLBACK_RETRY_INTERVAL_MS = 5 * 60 * 1000;

// Origem da cotação devolvida (campo `source` de GET /api/exchange-rate):
//  - "live": veio da consulta externa nas últimas 24 h (inclusive servida do cache nesse prazo)
//  - "stale": a consulta falhou e o cache tem mais de 24 h — serve o valor antigo
//  - "fallback": valor de emergência
export type ExchangeRateSource = "live" | "stale" | "fallback";

interface RateCache {
  rate: number;
  updatedAt: Date;
  // origem do que está guardado: consulta externa ou valor de emergência
  kind: "live" | "fallback";
}

export interface ExchangeRateResult {
  rate: number;
  updatedAt: Date;
  source: ExchangeRateSource;
}

let cache: RateCache | null = null;

async function fetchRateFromApi(): Promise<number> {
  const res = await fetch(EXCHANGE_API_URL);
  if (!res.ok) {
    throw new Error(`Exchange rate API respondeu ${res.status}`);
  }

  const data = (await res.json()) as { rates?: { BRL?: number } };
  const rate = data.rates?.BRL;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("Resposta da API de câmbio não trouxe um BRL válido");
  }

  return rate;
}

function toResult(entry: RateCache, source: ExchangeRateSource): ExchangeRateResult {
  return { rate: entry.rate, updatedAt: entry.updatedAt, source };
}

// Busca a cotação USD->BRL com cache em memória de 24h. Nunca lança: se a
// busca falhar, cai no último valor em cache (mesmo desatualizado, marcado
// "stale") ou, na ausência de qualquer cotação real, num fallback fixo
// (marcado "fallback") — a conversão de preço no site nunca pode travar por
// causa de uma API externa fora do ar.
export async function getExchangeRate(): Promise<ExchangeRateResult> {
  if (cache) {
    const age = Date.now() - cache.updatedAt.getTime();
    if (cache.kind === "live" && age <= CACHE_TTL_MS) return toResult(cache, "live");
    // fallback guardado há pouco: não consulta a API externa a cada requisição
    if (cache.kind === "fallback" && age <= FALLBACK_RETRY_INTERVAL_MS) return toResult(cache, "fallback");
  }

  try {
    const rate = await fetchRateFromApi();
    cache = { rate, updatedAt: new Date(), kind: "live" };
    return toResult(cache, "live");
  } catch (err) {
    console.error("Falha ao buscar cotação USD->BRL:", err);

    if (cache && cache.kind === "live") {
      // Já existia cotação real (só desatualizada, > 24h): serve ela mesma.
      return toResult(cache, "stale");
    }

    // Sem nenhuma cotação real: usa o fallback fixo. O timestamp é "agora"
    // só para marcar a última tentativa (a nova tentativa vem depois de
    // FALLBACK_RETRY_INTERVAL_MS) — o campo `source` diz que NÃO é fresca.
    cache = { rate: FALLBACK_RATE, updatedAt: new Date(), kind: "fallback" };
    return toResult(cache, "fallback");
  }
}

// Exposto só para os testes resetarem o estado do módulo entre casos.
export function __resetExchangeRateCacheForTests() {
  cache = null;
}
