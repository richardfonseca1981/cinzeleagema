import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import type { MercadoLivreAccount } from "@prisma/client";
import { env } from "../env";
import { prisma } from "../prisma";
import { HttpError } from "../../middleware/errorHandler";
import { decryptToken, encryptToken, isMercadoLivreConfigured } from "./crypto";
import { fetchWithRetry, parseJsonSafe } from "./httpBase";
import type { MercadoLivreTokenResponse, MercadoLivreUserMe } from "./types";

// Endpoints confirmados em developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao
// e .../pt_br/obtencao-do-access-token. O domínio de autorização é o do site
// BR (auth.mercadolivre.com.br); a troca/renovação de token e as chamadas de
// recurso usam sempre api.mercadolibre.com (domínio único para todos os
// sites, note o ".com" sem "re").
const AUTHORIZATION_URL = "https://auth.mercadolivre.com.br/authorization";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const USERS_ME_URL = "https://api.mercadolibre.com/users/me";

// Margem de segurança: renova o access_token um pouco antes do vencimento
// real (6h, 21600s — confirmado na doc acima) em vez de esperar expirar, para
// toda chamada ter margem de rede/retry.
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

const OAUTH_STATE_PURPOSE = "ml_oauth";

interface OAuthStatePayload {
  purpose: typeof OAUTH_STATE_PURPOSE;
  adminId: string;
  nonce: string;
}

// `state` anti-CSRF: um JWT de vida curta (10 min, mesma chave JWT_SECRET já
// usada para o login admin) em vez de uma tabela nova — autoverificável e
// sem round-trip ao banco. Liga a autorização ao admin que a iniciou.
export function createOAuthState(adminId: string): string {
  const payload: OAuthStatePayload = { purpose: OAUTH_STATE_PURPOSE, adminId, nonce: randomUUID() };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "10m" });
}

export function verifyOAuthState(state: string): { adminId: string } {
  let payload: OAuthStatePayload;
  try {
    payload = jwt.verify(state, env.JWT_SECRET) as OAuthStatePayload;
  } catch {
    throw new HttpError(400, "state inválido ou expirado — reinicie a conexão com o Mercado Livre");
  }
  if (payload.purpose !== OAUTH_STATE_PURPOSE || !payload.adminId) {
    throw new HttpError(400, "state inválido — reinicie a conexão com o Mercado Livre");
  }
  return { adminId: payload.adminId };
}

export function buildAuthorizationUrl(adminId: string): { url: string; state: string } {
  if (!isMercadoLivreConfigured()) {
    throw new HttpError(503, "Integração com o Mercado Livre não configurada (variáveis ML_* ausentes)");
  }

  const state = createOAuthState(adminId);
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.ML_APP_ID);
  url.searchParams.set("redirect_uri", env.ML_REDIRECT_URI);
  url.searchParams.set("state", state);
  return { url: url.toString(), state };
}

async function requestToken(params: Record<string, string>): Promise<MercadoLivreTokenResponse> {
  const response = await fetchWithRetry(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params),
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    // Nunca logar params (contém code/refresh_token) nem o corpo cru em
    // produção — a mensagem de erro do ML não inclui segredos, só motivo.
    const reason = typeof payload === "object" && payload && "message" in payload ? (payload as { message: unknown }).message : payload;
    throw new HttpError(response.status >= 500 ? 502 : 400, `Mercado Livre recusou a solicitação de token: ${String(reason)}`);
  }
  return payload as MercadoLivreTokenResponse;
}

export async function exchangeCodeForTokens(code: string): Promise<MercadoLivreTokenResponse> {
  if (!isMercadoLivreConfigured()) {
    throw new HttpError(503, "Integração com o Mercado Livre não configurada (variáveis ML_* ausentes)");
  }
  return requestToken({
    grant_type: "authorization_code",
    client_id: env.ML_APP_ID,
    client_secret: env.ML_CLIENT_SECRET,
    code,
    redirect_uri: env.ML_REDIRECT_URI,
  });
}

async function requestTokenRefresh(refreshToken: string): Promise<MercadoLivreTokenResponse> {
  return requestToken({
    grant_type: "refresh_token",
    client_id: env.ML_APP_ID,
    client_secret: env.ML_CLIENT_SECRET,
    refresh_token: refreshToken,
  });
}

export async function fetchMercadoLivreUser(accessToken: string): Promise<MercadoLivreUserMe> {
  const response = await fetchWithRetry(USERS_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new HttpError(502, `Falha ao confirmar a conexão com o Mercado Livre (GET /users/me): HTTP ${response.status}`);
  }
  return payload as MercadoLivreUserMe;
}

export async function upsertAccountFromTokens(
  tokenResponse: MercadoLivreTokenResponse,
  nickname: string
): Promise<MercadoLivreAccount> {
  const mlUserId = String(tokenResponse.user_id);
  const data = {
    nickname,
    accessToken: encryptToken(tokenResponse.access_token),
    refreshToken: encryptToken(tokenResponse.refresh_token),
    expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
    scope: tokenResponse.scope,
  };
  return prisma.mercadoLivreAccount.upsert({
    where: { mlUserId },
    create: { mlUserId, ...data },
    update: data,
  });
}

// Faz a renovação de fato, sob um advisory lock do Postgres por accountId
// (serializa chamadas concorrentes — duas abas admin, dois jobs). Quem espera
// o lock, ao obtê-lo, relê a conta e compara o refresh_token atual com o que
// o chamador tinha em mãos ANTES de esperar: se mudou, outra chamada
// concorrente já rotacionou enquanto esperávamos — devolve o resultado dela
// em vez de tentar de novo com um refresh_token já descartado pelo ML (ele é
// de uso único, confirmado na doc). Comparar o valor em vez de usar uma
// janela de tempo evita falso-positivo logo após criar a conta (updatedAt
// também "recente" nesse caso, mas não por uma renovação concorrente).
async function performRefresh(accountId: string, expectedCurrentRefreshToken: string): Promise<MercadoLivreAccount> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${accountId}))`;

    const account = await tx.mercadoLivreAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new HttpError(404, "Conta do Mercado Livre não encontrada");

    if (decryptToken(account.refreshToken) !== expectedCurrentRefreshToken) {
      return account;
    }

    const tokenResponse = await requestTokenRefresh(expectedCurrentRefreshToken);

    return tx.mercadoLivreAccount.update({
      where: { id: accountId },
      data: {
        accessToken: encryptToken(tokenResponse.access_token),
        refreshToken: encryptToken(tokenResponse.refresh_token),
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
        scope: tokenResponse.scope,
      },
    });
  });
}

// Renovação proativa: só chama a API do ML se o access_token já estiver
// perto de expirar (usada por getValidToken, antes de qualquer requisição).
export async function refreshAccessToken(accountId: string): Promise<MercadoLivreAccount> {
  const account = await prisma.mercadoLivreAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new HttpError(404, "Conta do Mercado Livre não encontrada");

  if (account.expiresAt.getTime() - Date.now() > EXPIRY_BUFFER_MS) {
    return account;
  }

  return performRefresh(accountId, decryptToken(account.refreshToken));
}

// Renovação forçada: usada quando a própria API respondeu 401 mesmo com o
// access_token "válido" pelo nosso relógio (revogado, expiração antecipada
// pelo ML, clock drift) — ignora a checagem de expiresAt, mas ainda colide
// corretamente com renovações concorrentes via performRefresh.
export async function forceRefreshAccessToken(accountId: string): Promise<MercadoLivreAccount> {
  const account = await prisma.mercadoLivreAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new HttpError(404, "Conta do Mercado Livre não encontrada");

  return performRefresh(accountId, decryptToken(account.refreshToken));
}

// Token em claro, pronto para o header Authorization — renova primeiro se
// estiver perto de expirar.
export async function getValidToken(accountId: string): Promise<string> {
  const account = await prisma.mercadoLivreAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new HttpError(404, "Conta do Mercado Livre não encontrada");

  if (account.expiresAt.getTime() - Date.now() > EXPIRY_BUFFER_MS) {
    return decryptToken(account.accessToken);
  }

  const refreshed = await refreshAccessToken(accountId);
  return decryptToken(refreshed.accessToken);
}

// Única conta conectada relevante para as rotas /status e /disconnect — a
// Fase 0 não tem UI para gerenciar múltiplas contas Mercado Livre, só a mais
// recente conectada é considerada "a conta ativa".
export function getActiveAccount(): Promise<MercadoLivreAccount | null> {
  return prisma.mercadoLivreAccount.findFirst({ orderBy: { updatedAt: "desc" } });
}
