import { afterEach, describe, expect, it, vi } from "vitest";
import "./setup";
import { MelhorEnvioProvider } from "../src/lib/shipping/melhorEnvioProvider";
import type { ShippingCalculationInput } from "../src/lib/shipping/types";

const baseConfig = { token: "test-token", userAgent: "Teste (teste@example.com)", sandbox: true };

function baseInput(overrides: Partial<ShippingCalculationInput> = {}): ShippingCalculationInput {
  return {
    originPostalCode: "01001000",
    destinationPostalCode: "20040020",
    items: [
      {
        productId: "produto-a",
        quantity: 1,
        unitPriceBRL: 100,
        package: { lengthCm: 16, widthCm: 11, heightCm: 2, weightGrams: 300 },
      },
    ],
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
      id: "produto-a",
      width: 11,
      height: 2,
      length: 16,
      weight: 0.3,
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
        items: [
          {
            productId: "produto-pesado",
            quantity: 1,
            unitPriceBRL: 100,
            package: { lengthCm: 16, widthCm: 11, heightCm: 2, weightGrams: 40_000 },
          },
        ],
      })
    );

    expect(result).toEqual({ ok: false, reason: "over_limits" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
