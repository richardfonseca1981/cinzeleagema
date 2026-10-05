import { describe, expect, it } from "vitest";
import {
  ERROR_MESSAGES,
  UNAVAILABLE_MESSAGES,
  ShippingTimeoutError,
  classifyShippingError,
  describeUnavailable,
  type ShippingAction,
} from "./errors";
import { UNAVAILABLE_REASONS } from "./types";
import { locales } from "./testHelpers";

function lookup(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], obj);
}

describe("cada unavailable.reason tem mensagem humana nos dois idiomas, com próxima ação", () => {
  it("os 6 códigos do contrato estão mapeados", () => {
    expect([...UNAVAILABLE_REASONS].sort()).toEqual(
      ["provider_error", "no_rates_configured", "invalid_destination", "over_limits", "incomplete_product_data", "not_configured"].sort()
    );
    expect(Object.keys(UNAVAILABLE_MESSAGES).sort()).toEqual([...UNAVAILABLE_REASONS].sort());
  });

  it.each([...UNAVAILABLE_REASONS])("%s → mensagem em pt-BR e en, e ao menos uma ação", (reason) => {
    const { messageKey, actions } = describeUnavailable(reason);
    expect(typeof lookup(locales.ptBR, messageKey)).toBe("string");
    expect(typeof lookup(locales.en, messageKey)).toBe("string");
    expect((lookup(locales.ptBR, messageKey) as string).length).toBeGreaterThan(20);
    expect(actions.length).toBeGreaterThan(0);
  });

  it("nenhuma tela morta: toda situação oferece 'combinar pelo WhatsApp'", () => {
    for (const reason of UNAVAILABLE_REASONS) expect(UNAVAILABLE_MESSAGES[reason].actions).toContain("arrange");
    for (const kind of Object.keys(ERROR_MESSAGES) as Array<keyof typeof ERROR_MESSAGES>) expect(ERROR_MESSAGES[kind].actions).toContain("arrange");
  });

  it("a ação certa para cada caso: tentar de novo, conferir o CEP, combinar", () => {
    expect(UNAVAILABLE_MESSAGES.provider_error.actions).toContain("retry");
    expect(UNAVAILABLE_MESSAGES.invalid_destination.actions).toContain("checkPostalCode");
    expect(UNAVAILABLE_MESSAGES.over_limits.actions).toEqual(["arrange"]);
  });

  it("over_limits explica que o frete da peça é combinado pelo atendimento", () => {
    expect(locales.ptBR.shipping.unavailable.over_limits).toMatch(/combinado com nosso atendimento/);
    expect(locales.en.shipping.unavailable.over_limits).toMatch(/arranged with our team/);
  });

  it("código desconhecido (backend novo) cai na mensagem de falha do provedor, sem quebrar", () => {
    expect(describeUnavailable("algo_novo")).toEqual(UNAVAILABLE_MESSAGES.provider_error);
  });

  it("toda ação referenciada tem rótulo nos dois idiomas", () => {
    const actions = new Set<ShippingAction>();
    [...Object.values(UNAVAILABLE_MESSAGES), ...Object.values(ERROR_MESSAGES)].forEach((m) => m.actions.forEach((a) => actions.add(a)));
    for (const action of actions) {
      expect(typeof lookup(locales.ptBR, `shipping.actions.${action}`)).toBe("string");
      expect(typeof lookup(locales.en, `shipping.actions.${action}`)).toBe("string");
    }
  });
});

describe("falhas da chamada (rede, timeout, 429, 4xx/5xx) têm tratamento próprio", () => {
  const api = (status: number, message: string) => Object.assign(new Error(message), { status });

  it("429 → limite de requisições", () => {
    expect(classifyShippingError(api(429, "Muitas requisições, tente novamente em alguns instantes"))).toBe("rate_limited");
  });

  it("400 de CEP inválido e de produto indisponível", () => {
    expect(classifyShippingError(api(400, "CEP inválido: informe 8 dígitos"))).toBe("invalid_postal_code");
    expect(classifyShippingError(api(400, "Produto abc não encontrado ou inativo"))).toBe("product_unavailable");
    expect(classifyShippingError(api(400, "Dados inválidos"))).toBe("server");
  });

  it("5xx → erro do servidor", () => {
    expect(classifyShippingError(api(500, "Erro interno do servidor"))).toBe("server");
    expect(classifyShippingError(api(502, "Bad gateway"))).toBe("server");
  });

  it("fetch sem resposta (TypeError) → rede; timeout próprio e AbortError → timeout", () => {
    expect(classifyShippingError(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyShippingError(new ShippingTimeoutError())).toBe("timeout");
    expect(classifyShippingError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe("timeout");
  });

  it("qualquer outra coisa → rede (sem lançar)", () => {
    expect(classifyShippingError(undefined)).toBe("network");
    expect(classifyShippingError("estranho")).toBe("network");
  });

  it("toda falha tem mensagem nos dois idiomas", () => {
    for (const kind of Object.keys(ERROR_MESSAGES) as Array<keyof typeof ERROR_MESSAGES>) {
      expect(typeof lookup(locales.ptBR, ERROR_MESSAGES[kind].messageKey)).toBe("string");
      expect(typeof lookup(locales.en, ERROR_MESSAGES[kind].messageKey)).toBe("string");
    }
  });
});
