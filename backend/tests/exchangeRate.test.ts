import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { FALLBACK_RETRY_INTERVAL_MS, __resetExchangeRateCacheForTests, getExchangeRate } from "../src/lib/exchangeRate";

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
    expect(result.source).toBe("live");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reutiliza o cache dentro de 24h sem buscar de novo", async () => {
    mockFetchResolved({ rates: { BRL: 5.1 } });
    const first = await getExchangeRate();

    vi.setSystemTime(new Date("2026-01-01T22:00:00.000Z")); // 10h depois, ainda dentro do TTL
    const second = await getExchangeRate();

    expect(second.rate).toBe(first.rate);
    expect(second.source).toBe("live"); // do cache, mas ainda dentro das 24 h
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
    expect(result.source).toBe("stale");
  });

  it("usa o fallback fixo (5.3) quando nunca houve cache e a busca falha", async () => {
    mockFetchRejected();

    const result = await getExchangeRate();
    expect(result.rate).toBe(5.3);
    expect(result.source).toBe("fallback");
  });

  it("usa o fallback fixo quando a API responde sem BRL válido", async () => {
    mockFetchResolved({ rates: {} });

    const result = await getExchangeRate();
    expect(result.rate).toBe(5.3);
    expect(result.source).toBe("fallback");
  });

  it("usa o fallback fixo quando a API responde com status de erro", async () => {
    mockFetchResolved({}, false);

    const result = await getExchangeRate();
    expect(result.rate).toBe(5.3);
    expect(result.source).toBe("fallback");
  });
});

const ok = (rate: number) => ({ ok: true, status: 200, json: async () => ({ rates: { BRL: rate } }) }) as unknown as Response;

describe("getExchangeRate — origem (source) e nova tentativa do fallback", () => {
  const START = new Date("2026-01-01T12:00:00.000Z");

  beforeEach(() => {
    __resetExchangeRateCacheForTests();
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("o intervalo de nova tentativa do fallback é de 5 minutos", () => {
    expect(FALLBACK_RETRY_INTERVAL_MS).toBe(5 * 60 * 1000);
  });

  it("falha com cache de mais de 24 h: 'stale', com o valor E o updatedAt antigos", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(5.2)).mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const first = await getExchangeRate();

    vi.setSystemTime(new Date("2026-01-03T00:00:00.000Z")); // > 24 h depois
    const result = await getExchangeRate();

    expect(result).toMatchObject({ rate: 5.2, source: "stale" });
    expect(result.updatedAt.toISOString()).toBe(first.updatedAt.toISOString()); // continua mostrando a idade real
  });

  it("depois de 'stale', uma busca que funciona volta para 'live' com o valor novo", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(5.2)).mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(ok(5.9));
    vi.stubGlobal("fetch", fetchMock);
    await getExchangeRate();
    vi.setSystemTime(new Date("2026-01-03T00:00:00.000Z"));
    expect((await getExchangeRate()).source).toBe("stale");

    const recovered = await getExchangeRate();

    expect(recovered).toMatchObject({ rate: 5.9, source: "live" });
  });

  it("fallback: uma nova requisição ANTES do intervalo curto NÃO consulta a API externa", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const first = await getExchangeRate();
    expect(first.source).toBe("fallback");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(START.getTime() + FALLBACK_RETRY_INTERVAL_MS - 1000)); // 4 min 59 s depois
    for (let i = 0; i < 5; i++) {
      const again = await getExchangeRate();
      expect(again).toMatchObject({ rate: 5.3, source: "fallback" });
    }

    expect(fetchMock).toHaveBeenCalledTimes(1); // nenhuma consulta nova
  });

  it("fallback: depois do intervalo tenta de novo e, se a consulta funciona, recupera para 'live'", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(ok(5.55));
    vi.stubGlobal("fetch", fetchMock);
    expect((await getExchangeRate()).source).toBe("fallback");

    vi.setSystemTime(new Date(START.getTime() + FALLBACK_RETRY_INTERVAL_MS + 1000)); // 5 min 1 s depois
    const result = await getExchangeRate();

    expect(result).toMatchObject({ rate: 5.55, source: "live" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("o fallback NÃO fica valendo como fresco por 24 h: com 1 h de diferença já houve nova tentativa", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(ok(5.4));
    vi.stubGlobal("fetch", fetchMock);
    await getExchangeRate();

    vi.setSystemTime(new Date(START.getTime() + 60 * 60 * 1000));
    const result = await getExchangeRate();

    expect(result.source).toBe("live");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fallback: se a nova tentativa também falha, continua 'fallback' e só tenta de novo daqui a outro intervalo", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);
    await getExchangeRate(); // 1ª consulta

    vi.setSystemTime(new Date(START.getTime() + FALLBACK_RETRY_INTERVAL_MS + 1000));
    expect(await getExchangeRate()).toMatchObject({ rate: 5.3, source: "fallback" });
    expect(fetchMock).toHaveBeenCalledTimes(2); // tentou de novo

    // logo em seguida: de novo sem consultar (o relógio da nova tentativa recomeçou)
    await getExchangeRate();
    await getExchangeRate();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date(START.getTime() + 2 * FALLBACK_RETRY_INTERVAL_MS + 2000));
    await getExchangeRate();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("o valor de emergência continua 5.3 e a função nunca lança", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(getExchangeRate()).resolves.toMatchObject({ rate: 5.3, source: "fallback" });
  });

  it("cotação 'live' dentro das 24 h não é consultada de novo, mesmo com muitas requisições", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(5.1));
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 10; i++) {
      vi.setSystemTime(new Date(START.getTime() + i * 60 * 60 * 1000)); // até 9 h depois
      expect((await getExchangeRate()).source).toBe("live");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("acrescenta source (live) sem mudar rate e updatedAt — resposta aditiva", async () => {
    mockFetchResolved({ rates: { BRL: 5.25 } });

    const res = await request(app).get("/api/exchange-rate");

    expect(res.body.source).toBe("live");
    expect(Object.keys(res.body).sort()).toEqual(["rate", "source", "updatedAt"]);
  });

  it("devolve source 'fallback' quando a consulta falha e nunca houve cotação", async () => {
    mockFetchRejected();

    const res = await request(app).get("/api/exchange-rate");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rate: 5.3, source: "fallback" });
    expect(typeof res.body.updatedAt).toBe("string");
  });
});

describe("GET /api/exchange-rate — 'stale'", () => {
  beforeEach(() => {
    __resetExchangeRateCacheForTests();
    vi.useFakeTimers({ toFake: ["Date"] }); // só o relógio: o supertest precisa dos timers reais
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("devolve source 'stale' com o valor e o updatedAt antigos quando a consulta falha com cache de mais de 24 h", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok(5.2)).mockRejectedValueOnce(new Error("down")));
    const first = await request(app).get("/api/exchange-rate");
    expect(first.body.source).toBe("live");

    vi.setSystemTime(new Date("2026-01-03T00:00:00.000Z"));
    const res = await request(app).get("/api/exchange-rate");

    expect(res.body).toMatchObject({ rate: 5.2, source: "stale", updatedAt: first.body.updatedAt });
  });
});
