import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./setup";
import { prisma } from "../src/lib/prisma";
import { encryptToken } from "../src/lib/mercadoLivre/crypto";
import { mercadoLivreRequest } from "../src/lib/mercadoLivre/client";

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

async function createAccount() {
  return prisma.mercadoLivreAccount.create({
    data: {
      mlUserId: "123",
      nickname: "LOJA_TESTE",
      accessToken: encryptToken("access-valido"),
      refreshToken: encryptToken("refresh-valido"),
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
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

describe("mercadoLivreRequest", () => {
  it("chama o recurso com o Bearer do access_token válido", async () => {
    const account = await createAccount();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 123, nickname: "LOJA_TESTE" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await mercadoLivreRequest(account.id, "/users/me");

    expect(result.data).toEqual({ id: 123, nickname: "LOJA_TESTE" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.mercadolibre.com/users/me");
    expect(init.headers.Authorization).toBe("Bearer access-valido");
  });

  it("em 401, renova o token uma única vez e repete a chamada original", async () => {
    const account = await createAccount();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "invalid token" }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "access-renovado", refresh_token: "refresh-renovado", expires_in: 21600, scope: "offline_access read write", token_type: "bearer", user_id: 123 }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 123 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await mercadoLivreRequest(account.id, "/users/me");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.mercadolibre.com/users/me");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.mercadolibre.com/oauth/token");
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.mercadolibre.com/users/me");
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer access-renovado");
    expect(result.data).toEqual({ id: 123 });
  });

  it("propaga um erro com status 401 quando a chamada continua falhando mesmo após renovar o token", async () => {
    const account = await createAccount();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "invalid token" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "access-renovado",
          refresh_token: "refresh-renovado",
          expires_in: 21600,
          scope: "offline_access read write",
          token_type: "bearer",
          user_id: 123,
        })
      )
      .mockResolvedValueOnce(jsonResponse(401, { message: "invalid token" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(mercadoLivreRequest(account.id, "/users/me")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
