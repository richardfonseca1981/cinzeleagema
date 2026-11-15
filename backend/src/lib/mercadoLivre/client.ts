import { decryptToken } from "./crypto";
import { forceRefreshAccessToken, getValidToken } from "./auth";
import { MercadoLivreApiError, fetchWithRetry, parseJsonSafe } from "./httpBase";

const API_BASE_URL = "https://api.mercadolibre.com";

export interface MercadoLivreRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  // Repassado para fetchWithRetry (default ali: 2). Quem publica/altera um
  // recurso (POST /items e qualquer PUT de status — ver publisherClient.ts)
  // deve passar 0: um 429/5xx em POST pode significar que o Mercado Livre já
  // processou o pedido e só a resposta se perdeu — tentar de novo sem saber
  // o resultado da primeira tentativa arrisca criar/alterar em duplicidade.
  // GET nunca tem esse risco (idempotente por natureza) e mantém o default.
  maxRetries?: number;
}

export interface MercadoLivreResponse<T> {
  status: number;
  data: T;
}

// Cliente HTTP autenticado genérico para qualquer recurso da API do Mercado
// Livre, usado pelas rotas admin desta fase (GET /users/me) e reaproveitável
// nas fases seguintes (publicação de itens). fetchWithRetry (lib/mercadoLivre/httpBase.ts)
// já cobre timeout e retry com backoff em 429/5xx; aqui tratamos só o 401:
// renova o token uma vez e repete a chamada (nunca em loop).
export async function mercadoLivreRequest<T = unknown>(
  accountId: string,
  path: string,
  options: MercadoLivreRequestOptions = {}
): Promise<MercadoLivreResponse<T>> {
  const url = new URL(path.startsWith("http") ? path : `${API_BASE_URL}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const call = (accessToken: string) =>
    fetchWithRetry(
      url.toString(),
      {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      },
      { maxRetries: options.maxRetries }
    );

  let accessToken = await getValidToken(accountId);
  let response = await call(accessToken);

  if (response.status === 401) {
    const refreshedAccount = await forceRefreshAccessToken(accountId);
    accessToken = decryptToken(refreshedAccount.accessToken);
    response = await call(accessToken);
  }

  const data = (await parseJsonSafe(response)) as T;
  if (!response.ok) {
    throw new MercadoLivreApiError(`Mercado Livre respondeu HTTP ${response.status} em ${path}`, response.status, data);
  }
  return { status: response.status, data };
}
