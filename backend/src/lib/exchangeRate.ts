const EXCHANGE_API_URL = "https://open.er-api.com/v6/latest/USD";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // a API pública atualiza a cotação a cada 24h

// Fallback de emergência — só é usado se NUNCA houve cache em memória e a
// busca na API falhar (primeira chamada após o boot, sem internet/API fora
// do ar). Valor aproximado, revisar periodicamente.
const FALLBACK_RATE = 5.3;

interface RateCache {
  rate: number;
  updatedAt: Date;
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

// Busca a cotação USD->BRL com cache em memória de 24h. Nunca lança: se a
// busca falhar, cai no último valor em cache (mesmo desatualizado) ou, na
// ausência de qualquer cache prévio, num fallback fixo — a conversão de
// preço no site nunca pode travar por causa de uma API externa fora do ar.
//
// Cada `return` abaixo acontece logo depois de um `if (cache)` ou de uma
// atribuição a `cache`, para o TypeScript conseguir provar (sem `as`/`!`)
// que o valor retornado nunca é null, já que `cache` é uma variável de
// módulo mutável e o compilador não estreita seu tipo automaticamente.
export async function getExchangeRate(): Promise<{ rate: number; updatedAt: Date }> {
  if (cache && Date.now() - cache.updatedAt.getTime() <= CACHE_TTL_MS) {
    return cache;
  }

  try {
    const rate = await fetchRateFromApi();
    cache = { rate, updatedAt: new Date() };
    return cache;
  } catch (err) {
    console.error("Falha ao buscar cotação USD->BRL:", err);

    if (cache) {
      // Já existia cache (só desatualizado): mantém como está e serve ele mesmo.
      return cache;
    }

    // Sem cache prévio: usa o fallback fixo, mas já cacheia com o timestamp
    // atual para não tentar de novo a cada requisição enquanto a API
    // estiver fora do ar (só tenta de novo após 24h).
    cache = { rate: FALLBACK_RATE, updatedAt: new Date() };
    return cache;
  }
}

// Exposto só para os testes resetarem o estado do módulo entre casos.
export function __resetExchangeRateCacheForTests() {
  cache = null;
}
