import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import "./setup";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/lib/env";
import { encryptToken, decryptToken } from "../src/lib/mercadoLivre/crypto";
import {
  buildAuthorizationUrl,
  createOAuthState,
  exchangeCodeForTokens,
  getValidToken,
  refreshAccessToken,
  verifyOAuthState,
} from "../src/lib/mercadoLivre/auth";

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

function tokenResponseBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    access_token: "APP_USR-new-access-token",
    token_type: "bearer",
    expires_in: 21600,
    scope: "offline_access read write",
    user_id: 999888777,
    refresh_token: "TG-new-refresh-token",
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

async function createAccount(overrides: Partial<{ expiresAt: Date; accessToken: string; refreshToken: string }> = {}) {
  return prisma.mercadoLivreAccount.create({
    data: {
      mlUserId: "123",
      nickname: "LOJA_TESTE",
      accessToken: encryptToken(overrides.accessToken ?? "old-access-token"),
      refreshToken: encryptToken(overrides.refreshToken ?? "old-refresh-token"),
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 6 * 60 * 60 * 1000),
      scope: "offline_access read write",
    },
  });
}

beforeEach(async () => {
  await prisma.mercadoLivreListing.deleteMany();
  await prisma.mercadoLivreAccount.deleteMany();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("state anti-CSRF", () => {
  it("cria e verifica um state válido, devolvendo o adminId", () => {
    const state = createOAuthState("admin-123");
    expect(verifyOAuthState(state).adminId).toBe("admin-123");
  });

  it("rejeita state com assinatura inválida", () => {
    const bogus = jwt.sign({ purpose: "ml_oauth", adminId: "admin-123", nonce: "x" }, "chave-errada");
    expect(() => verifyOAuthState(bogus)).toThrow();
  });

  it("rejeita state com purpose diferente", () => {
    const wrongPurpose = jwt.sign({ purpose: "outra-coisa", adminId: "admin-123", nonce: "x" }, env.JWT_SECRET);
    expect(() => verifyOAuthState(wrongPurpose)).toThrow();
  });

  it("rejeita state expirado", () => {
    const expired = jwt.sign({ purpose: "ml_oauth", adminId: "admin-123", nonce: "x" }, env.JWT_SECRET, { expiresIn: -10 });
    expect(() => verifyOAuthState(expired)).toThrow();
  });
});

describe("buildAuthorizationUrl", () => {
  it("monta a URL de autorização com client_id, redirect_uri e state verificável", () => {
    const { url, state } = buildAuthorizationUrl("admin-123");
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe("https://auth.mercadolivre.com.br/authorization");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe(env.ML_APP_ID);
    expect(parsed.searchParams.get("redirect_uri")).toBe(env.ML_REDIRECT_URI);
    expect(parsed.searchParams.get("state")).toBe(state);
    expect(verifyOAuthState(state).adminId).toBe("admin-123");
  });
});

describe("exchangeCodeForTokens", () => {
  it("troca o code por tokens enviando os parâmetros corretos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, tokenResponseBody()));
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeCodeForTokens("TG-authorization-code");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(TOKEN_URL);
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe(env.ML_APP_ID);
    expect(body.get("client_secret")).toBe(env.ML_CLIENT_SECRET);
    expect(body.get("code")).toBe("TG-authorization-code");
    expect(body.get("redirect_uri")).toBe(env.ML_REDIRECT_URI);
    expect(result.access_token).toBe("APP_USR-new-access-token");
  });

  it("propaga erro legível quando o Mercado Livre rejeita o code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { message: "invalid_grant" })));

    await expect(exchangeCodeForTokens("code-invalido")).rejects.toMatchObject({ status: 400 });
  });
});

describe("refreshAccessToken", () => {
  it("renova o token, grava o novo refresh_token (rotação) e nunca deixa o antigo em claro no banco", async () => {
    const account = await createAccount({ expiresAt: new Date(Date.now() - 1000), refreshToken: "old-refresh-token" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, tokenResponseBody()));
    vi.stubGlobal("fetch", fetchMock);

    const updated = await refreshAccessToken(account.id);

    expect(decryptToken(updated.accessToken)).toBe("APP_USR-new-access-token");
    expect(decryptToken(updated.refreshToken)).toBe("TG-new-refresh-token");
    expect(updated.refreshToken).not.toContain("old-refresh-token");
    expect(updated.expiresAt.getTime()).toBeGreaterThan(Date.now() + 5 * 60 * 60 * 1000);
    expect(updated.expiresAt.getTime()).toBeLessThan(Date.now() + 7 * 60 * 60 * 1000);

    const [, init] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("old-refresh-token");

    const persisted = await prisma.mercadoLivreAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(decryptToken(persisted.refreshToken)).toBe("TG-new-refresh-token");
  });

  it("não chama a API quando o token ainda não está perto de expirar", async () => {
    const account = await createAccount({ expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000) });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshAccessToken(account.id);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.id).toBe(account.id);
  });

  it("corrida: duas renovações concorrentes da mesma conta chamam a API do ML só uma vez", async () => {
    const account = await createAccount({ expiresAt: new Date(Date.now() - 1000) });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, tokenResponseBody()));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([refreshAccessToken(account.id), refreshAccessToken(account.id)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decryptToken(first.accessToken)).toBe("APP_USR-new-access-token");
    expect(decryptToken(second.accessToken)).toBe("APP_USR-new-access-token");
  });
});

describe("getValidToken", () => {
  it("devolve o access_token em claro sem renovar quando ainda está válido", async () => {
    const account = await createAccount({ expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), accessToken: "token-ainda-valido" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const token = await getValidToken(account.id);

    expect(token).toBe("token-ainda-valido");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renova automaticamente e devolve o novo access_token quando está perto de expirar", async () => {
    const account = await createAccount({ expiresAt: new Date(Date.now() - 1000) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, tokenResponseBody())));

    const token = await getValidToken(account.id);

    expect(token).toBe("APP_USR-new-access-token");
  });
});
