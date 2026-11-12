import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import "./setup";
import { env as realEnv } from "../src/lib/env";

// Produção hoje não tem nenhuma variável ML_* configurada — o backend
// precisa subir normalmente mesmo assim (ver lib/env.ts: tudo opcional) e só
// as rotas /api/admin/mercadolivre/* devem acusar a ausência, com 503.
describe("boot sem variáveis ML_*", () => {
  afterEach(() => {
    vi.doUnmock("../src/lib/env");
    vi.doUnmock("../src/lib/prisma");
    vi.resetModules();
  });

  it("app sobe normalmente: /health funciona e rotas ML respondem 503", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/env", () => ({
      env: { ...realEnv, ML_APP_ID: "", ML_CLIENT_SECRET: "", ML_REDIRECT_URI: "", ML_TOKEN_ENC_KEY: "" },
    }));

    const { createApp } = await import("../src/app");
    const { generateTestToken } = await import("./helpers");
    const app = createApp();

    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok" });

    // Rota pública não-ML continua funcionando normalmente.
    const products = await request(app).get("/api/products");
    expect(products.status).toBe(200);

    const auth = { Authorization: `Bearer ${generateTestToken({ sub: "admin-sem-ml" })}` };

    const connect = await request(app).get("/api/admin/mercadolivre/connect").set(auth);
    expect(connect.status).toBe(503);
    expect(connect.body).toEqual({ error: "Integração Mercado Livre não configurada" });

    const callback = await request(app).get("/api/admin/mercadolivre/callback?code=x&state=y").set(auth);
    expect(callback.status).toBe(503);
    expect(callback.body).toEqual({ error: "Integração Mercado Livre não configurada" });

    const status = await request(app).get("/api/admin/mercadolivre/status").set(auth);
    expect(status.status).toBe(503);
    expect(status.body).toEqual({ error: "Integração Mercado Livre não configurada" });

    const disconnect = await request(app).delete("/api/admin/mercadolivre/disconnect").set(auth);
    expect(disconnect.status).toBe(503);
    expect(disconnect.body).toEqual({ error: "Integração Mercado Livre não configurada" });
  });

  it("sem token, rotas ML ainda respondem 401 (não 503) mesmo sem ML_* configurado", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/env", () => ({
      env: { ...realEnv, ML_APP_ID: "", ML_CLIENT_SECRET: "", ML_REDIRECT_URI: "", ML_TOKEN_ENC_KEY: "" },
    }));

    const { createApp } = await import("../src/app");
    const app = createApp();

    const res = await request(app).get("/api/admin/mercadolivre/status");
    expect(res.status).toBe(401);
  });
});
