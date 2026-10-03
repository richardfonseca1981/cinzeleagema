// Consulta de cidade/estado por CEP (ViaCEP), usada tanto por
// GET /api/shipping/postal-code/:code quanto pelo quoteService para
// preencher destination.city/state. Formato confirmado em viacep.com.br:
// GET https://viacep.com.br/ws/{cep}/json/ -> { localidade, uf, erro? }.
const VIACEP_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface PostalCodeLookupResult {
  city: string | null;
  state: string | null;
}

interface CacheEntry {
  result: PostalCodeLookupResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

interface ViaCepResponse {
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

// Nunca lança: a falta do nome da cidade nunca pode bloquear uma cotação de
// frete, então qualquer falha (timeout, rede, CEP inexistente) cai para
// { city: null, state: null } em vez de propagar o erro.
export async function lookupPostalCode(cep: string): Promise<PostalCodeLookupResult> {
  const cached = cache.get(cep);
  if (cached && Date.now() <= cached.expiresAt) {
    return cached.result;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VIACEP_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`ViaCEP respondeu HTTP ${response.status}`);
    }

    const data = (await response.json()) as ViaCepResponse;
    const result: PostalCodeLookupResult = data.erro ? { city: null, state: null } : { city: data.localidade ?? null, state: data.uf ?? null };

    cache.set(cep, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.error("Falha ao consultar ViaCEP:", err);
    return { city: null, state: null };
  }
}

// Exposto só para os testes resetarem o estado do módulo entre casos.
export function __resetPostalCodeCacheForTests(): void {
  cache.clear();
}
