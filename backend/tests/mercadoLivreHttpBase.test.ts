import { afterEach, describe, expect, it, vi } from "vitest";
import "./setup";
import { MercadoLivreApiError, fetchWithRetry } from "../src/lib/mercadoLivre/httpBase";

function jsonResponse(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mercadoLivre httpBase.fetchWithRetry", () => {
  it("retorna a resposta direto quando o primeiro attempt já tem sucesso", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://api.mercadolibre.com/x", {}, { maxRetries: 2 });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("repete em 429 e devolve a resposta de sucesso da tentativa seguinte", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(429)).mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://api.mercadolibre.com/x", {}, { maxRetries: 2 });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("repete em 5xx e devolve a resposta de sucesso da tentativa seguinte", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(503)).mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://api.mercadolibre.com/x", {}, { maxRetries: 2 });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("NÃO repete em 4xx de validação — devolve a resposta de erro direto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { message: "invalid_grant" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://api.mercadolibre.com/x", {}, { maxRetries: 2 });

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("esgota os retries em 5xx persistente e devolve a resposta de erro (quem chama decide o que fazer)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://api.mercadolibre.com/x", {}, { maxRetries: 1 });

    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lança MercadoLivreApiError quando a chamada de rede falha em todas as tentativas", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithRetry("https://api.mercadolibre.com/x", {}, { maxRetries: 1 })).rejects.toBeInstanceOf(MercadoLivreApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
