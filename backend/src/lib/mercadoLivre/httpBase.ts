// Fetch de baixo nível compartilhado por auth.ts (troca/renovação de tokens)
// e client.ts (chamadas autenticadas à API). Timeout por tentativa e retry
// com backoff exponencial em 429/5xx — nunca em 4xx de validação, que não se
// resolve tentando de novo (mesmo critério usado em
// lib/shipping/melhorEnvioProvider.ts).
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 300;

export class MercadoLivreApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
  }
}

export interface FetchWithRetryOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Sempre retorna a Response (sucesso, 4xx não retriável, ou 429/5xx mesmo
// depois de esgotar os retries) — quem chama decide o que fazer com o
// corpo/status, como requestToken() em auth.ts faz ao converter !response.ok
// em HttpError. Só lança quando a própria chamada de rede falha (timeout,
// abort, DNS) em todas as tentativas.
export async function fetchWithRetry(url: string, init: RequestInit, options: FetchWithRetryOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);

      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        await sleep(BASE_BACKOFF_MS * 2 ** attempt);
        continue;
      }

      return response;
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries) break;
      await sleep(BASE_BACKOFF_MS * 2 ** attempt);
    }
  }

  throw new MercadoLivreApiError(`Falha ao chamar o Mercado Livre após tentativas de retry: ${String(lastError)}`, 0, null);
}

export async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
