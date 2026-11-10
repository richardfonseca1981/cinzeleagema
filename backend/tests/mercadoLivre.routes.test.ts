import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { generateTestToken } from "./helpers";
import { createOAuthState } from "../src/lib/mercadoLivre/auth";

const app = createApp();
const adminId = "admin-ml-test";
const auth = { Authorization: `Bearer ${generateTestToken({ sub: adminId })}` };

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

beforeEach(async () => {
  await prisma.mercadoLivreListing.deleteMany();
  await prisma.mercadoLivreAccount.deleteMany();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.mercadoLivreListing.deleteMany();
  await prisma.mercadoLivreAccount.deleteMany();
  await prisma.$disconnect();
});

describe("autenticação", () => {
  it.each([
    ["get", "/api/admin/mercadolivre/connect"],
    ["get", "/api/admin/mercadolivre/callback"],
    ["get", "/api/admin/mercadolivre/status"],
    ["delete", "/api/admin/mercadolivre/disconnect"],
  ] as const)("%s %s sem token responde 401", async (method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
  });
});

describe("GET /connect", () => {
  it("devolve a URL de autorização e um state verificável", async () => {
    const res = await request(app).get("/api/admin/mercadolivre/connect").set(auth);

    expect(res.status).toBe(200);
    expect(res.body.url).toContain("https://auth.mercadolivre.com.br/authorization");
    expect(res.body.url).toContain(`state=${res.body.state}`);
    expect(typeof res.body.state).toBe("string");
  });
});

describe("GET /status e DELETE /disconnect sem conexão", () => {
  it("status inicial é desconectado", async () => {
    const res = await request(app).get("/api/admin/mercadolivre/status").set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: false });
  });

  it("disconnect sem conta conectada não dá erro", async () => {
    const res = await request(app).delete("/api/admin/mercadolivre/disconnect").set(auth);
    expect(res.status).toBe(204);
  });
});

describe("GET /callback", () => {
  it("rejeita sem code/state", async () => {
    const res = await request(app).get("/api/admin/mercadolivre/callback").set(auth);
    expect(res.status).toBe(400);
  });

  it("rejeita state inválido", async () => {
    const res = await request(app).get("/api/admin/mercadolivre/callback?code=x&state=invalido").set(auth);
    expect(res.status).toBe(400);
  });

  it("rejeita state de outro admin (anti-CSRF)", async () => {
    const stateDeOutroAdmin = createOAuthState("outro-admin-id");
    const res = await request(app).get(`/api/admin/mercadolivre/callback?code=x&state=${stateDeOutroAdmin}`).set(auth);
    expect(res.status).toBe(403);
  });

  it("troca code por tokens, confirma via /users/me e persiste a conta (cifrada)", async () => {
    const connectRes = await request(app).get("/api/admin/mercadolivre/connect").set(auth);
    const { state } = connectRes.body;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "APP_USR-token-conexao",
          refresh_token: "TG-refresh-conexao",
          expires_in: 21600,
          scope: "offline_access read write",
          token_type: "bearer",
          user_id: 555,
        })
      )
      .mockResolvedValueOnce(jsonResponse(200, { id: 555, nickname: "LOJA_CINZEL_TESTE" }));
    vi.stubGlobal("fetch", fetchMock);

    const callbackRes = await request(app)
      .get(`/api/admin/mercadolivre/callback?code=TG-authorization-code&state=${state}`)
      .set(auth);

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.body).toMatchObject({ connected: true, mlUserId: "555", nickname: "LOJA_CINZEL_TESTE" });

    const stored = await prisma.mercadoLivreAccount.findUniqueOrThrow({ where: { mlUserId: "555" } });
    expect(stored.accessToken).not.toContain("APP_USR-token-conexao");
    expect(stored.refreshToken).not.toContain("TG-refresh-conexao");

    const statusRes = await request(app).get("/api/admin/mercadolivre/status").set(auth);
    expect(statusRes.body).toMatchObject({ connected: true, nickname: "LOJA_CINZEL_TESTE" });

    const disconnectRes = await request(app).delete("/api/admin/mercadolivre/disconnect").set(auth);
    expect(disconnectRes.status).toBe(204);

    const statusAfter = await request(app).get("/api/admin/mercadolivre/status").set(auth);
    expect(statusAfter.body).toEqual({ connected: false });
  });
});
