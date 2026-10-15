import { afterEach, describe, expect, it, vi } from "vitest";
import "./setup";
import { MelhorEnvioProvider } from "../src/lib/shipping/melhorEnvioProvider";
import type { ShippingCalculationInput } from "../src/lib/shipping/types";

const baseConfig = { token: "test-token", userAgent: "Teste (teste@example.com)", sandbox: true };

function baseInput(overrides: Partial<ShippingCalculationInput> = {}): ShippingCalculationInput {
  return {
    originPostalCode: "01001000",
    destinationPostalCode: "20040020",
    shipment: { box: { lengthCm: 40, widthCm: 30, heightCm: 25 }, weightGrams: 380, insuranceValueBRL: 100 },
    ...overrides,
  };
}

function mockFetchResolved(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response)
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MelhorEnvioProvider.calculate", () => {
  it("envia um único volume com a caixa fixa, peso total e seguro somado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await new MelhorEnvioProvider(baseConfig).calculate(baseInput());

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.products).toEqual([
      { id: "pedido", length: 40, width: 30, height: 25, weight: 0.38, insurance_value: 100, quantity: 1 },
    ]);
  });

  it("mapeia uma resposta de sucesso para o contrato de ShippingOption", async () => {
    mockFetchResolved([
      {
        id: 1,
        name: "PAC",
        price: "37.79",
        custom_price: "35.70",
        delivery_time: 9,
        delivery_range: { min: 8, max: 9 },
        custom_delivery_time: 9,
        custom_delivery_range: { min: 8, max: 9 },
        company: { id: 1, name: "Correios" },
      },
    ]);

    const provider = new MelhorEnvioProvider(baseConfig);
    const result = await provider.calculate(baseInput());

    expect(result).toEqual({
      ok: true,
      options: [
        {
          id: "1",
          carrier: "Correios",
          service: "PAC",
          priceBRL: 35.7,
          deliveryDaysMin: 8,
          deliveryDaysMax: 9,
          kind: "quoted",
        },
      ],
    });

    const [, requestInit] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(requestInit.headers.Authorization).toBe("Bearer test-token");
    expect(requestInit.headers["User-Agent"]).toBe("Teste (teste@example.com)");
    const payload = JSON.parse(requestInit.body);
    expect(payload.products[0]).toEqual({
      id: "pedido",
      width: 30,
      height: 25,
      length: 40,
      weight: 0.38,
      insurance_value: 100,
      quantity: 1,
    });
  });

  it("omite serviços com erro individual, mantendo os demais", async () => {
    mockFetchResolved([
      { id: 1, name: "PAC", price: "37.79", company: { name: "Correios" }, error: "Peso excede o limite" },
      { id: 2, name: "SEDEX", price: "55.10", company: { name: "Correios" } },
    ]);

    const provider = new MelhorEnvioProvider(baseConfig);
    const result = await provider.calculate(baseInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options).toHaveLength(1);
      expect(result.options[0].service).toBe("SEDEX");
    }
  });

  it("retorna provider_error após 1 retry quando a chamada falha (timeout/rede)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MelhorEnvioProvider(baseConfig);
    const result = await provider.calculate(baseInput());

    expect(result).toEqual({ ok: false, reason: "provider_error" });
    // 1 tentativa inicial + 1 retry = 2 chamadas
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("responde indisponível (provider_error) em erro 401, sem relançar nem expor o token", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchResolved({ message: "Unauthenticated" }, 401);

    const provider = new MelhorEnvioProvider(baseConfig);
    const result = await provider.calculate(baseInput());

    expect(result).toEqual({ ok: false, reason: "provider_error" });
    const loggedMessages = errorSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(loggedMessages).toContain("token inválido ou expirado");
    expect(loggedMessages).not.toContain("test-token");

    errorSpy.mockRestore();
  });

  it("trata resposta vazia (200, []) como no_rates_configured", async () => {
    mockFetchResolved([]);

    const provider = new MelhorEnvioProvider(baseConfig);
    const result = await provider.calculate(baseInput());

    expect(result).toEqual({ ok: false, reason: "no_rates_configured" });
  });

  it("retorna over_limits sem chamar a API quando o peso total excede o limite configurado", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MelhorEnvioProvider(baseConfig);
    const result = await provider.calculate(
      baseInput({
        shipment: { box: { lengthCm: 40, widthCm: 30, heightCm: 25 }, weightGrams: 40_000, insuranceValueBRL: 100 },
      })
    );

    expect(result).toEqual({ ok: false, reason: "over_limits" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
