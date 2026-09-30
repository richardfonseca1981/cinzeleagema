import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { __resetExchangeRateCacheForTests, getExchangeRate } from "../src/lib/exchangeRate";

const app = createApp();

function mockFetchResolved(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    } as unknown as Response)
  );
}

function mockFetchRejected(error = new Error("network down")) {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(error));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getExchangeRate", () => {
  beforeEach(() => {
    __resetExchangeRateCacheForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("busca a cotação na API e cacheia o resultado", async () => {
    mockFetchResolved({ rates: { BRL: 5.42 } });

    const result = await getExchangeRate();

    expect(result.rate).toBe(5.42);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reutiliza o cache dentro de 24h sem buscar de novo", async () => {
    mockFetchResolved({ rates: { BRL: 5.1 } });
    const first = await getExchangeRate();

    vi.setSystemTime(new Date("2026-01-01T22:00:00.000Z")); // 10h depois, ainda dentro do TTL
    const second = await getExchangeRate();

    expect(second.rate).toBe(first.rate);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("busca de novo depois de 24h de cache", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ rates: { BRL: 5.1 } }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ rates: { BRL: 5.6 } }) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await getExchangeRate();

    vi.setSystemTime(new Date("2026-01-03T00:00:00.000Z")); // > 24h depois
    const result = await getExchangeRate();

    expect(result.rate).toBe(5.6);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("mantém o último valor em cache (mesmo desatualizado) quando a busca falha", async () => {
    mockFetchResolved({ rates: { BRL: 5.2 } });
    await getExchangeRate();

    vi.setSystemTime(new Date("2026-01-03T00:00:00.000Z"));
    mockFetchRejected();

    const result = await getExchangeRate();
    expect(result.rate).toBe(5.2);
  });

  it("usa o fallback fixo (5.3) quando nunca houve cache e a busca falha", async () => {
    mockFetchRejected();

    const result = await getExchangeRate();
    expect(result.rate).toBe(5.3);
  });

  it("usa o fallback fixo quando a API responde sem BRL válido", async () => {
    mockFetchResolved({ rates: {} });

    const result = await getExchangeRate();
    expect(result.rate).toBe(5.3);
  });

  it("usa o fallback fixo quando a API responde com status de erro", async () => {
    mockFetchResolved({}, false);

    const result = await getExchangeRate();
    expect(result.rate).toBe(5.3);
  });
});

describe("GET /api/exchange-rate", () => {
  beforeEach(() => {
    __resetExchangeRateCacheForTests();
  });

  it("retorna rate e updatedAt em ISO", async () => {
    mockFetchResolved({ rates: { BRL: 5.25 } });

    const res = await request(app).get("/api/exchange-rate");

    expect(res.status).toBe(200);
    expect(res.body.rate).toBe(5.25);
    expect(typeof res.body.updatedAt).toBe("string");
    expect(new Date(res.body.updatedAt).toISOString()).toBe(res.body.updatedAt);
  });
});
