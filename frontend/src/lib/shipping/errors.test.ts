import { describe, expect, it } from "vitest";
import {
  ShippingTimeoutError,
  classifyShippingError,
  describeIssue,
  issueFromError,
  issueFromUnavailableReason,
  type ShippingAction,
  type ShippingErrorKind,
  type ShippingIssue,
} from "./errors";
import { UNAVAILABLE_REASONS } from "./types";
import { locales } from "./testHelpers";

function lookup(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], obj);
}

const ERROR_KINDS: ShippingErrorKind[] = ["rate_limited", "invalid_postal_code", "product_unavailable", "network", "timeout", "server"];
const actionsOf = (issue: ShippingIssue) => describeIssue(issue).actions;

describe("cada unavailable.reason do contrato vira uma situação com mensagem humana nos dois idiomas", () => {
  it("os 6 códigos do contrato estão mapeados", () => {
    expect([...UNAVAILABLE_REASONS].sort()).toEqual(
      ["provider_error", "no_rates_configured", "invalid_destination", "over_limits", "incomplete_product_data", "not_configured"].sort()
    );
  });

  it.each([...UNAVAILABLE_REASONS])("%s → mensagem em pt-BR e en", (reason) => {
    const { messageKey } = describeIssue(issueFromUnavailableReason(reason));
    expect((lookup(locales.ptBR, messageKey) as string).length).toBeGreaterThan(20);
    expect((lookup(locales.en, messageKey) as string).length).toBeGreaterThan(20);
  });

  it("'a combinar' automático SÓ em over_limits, país sem tarifa e produto incompleto", () => {
    expect(issueFromUnavailableReason("over_limits")).toEqual({ type: "arrange", reason: "over_limits" });
    expect(issueFromUnavailableReason("no_rates_configured")).toEqual({ type: "arrange", reason: "no_rates_configured" });
    expect(issueFromUnavailableReason("incomplete_product_data")).toEqual({ type: "arrange", reason: "incomplete_product_data" });
  });

  it("falhas técnicas (provider_error, not_configured, rede, timeout, 429, servidor) exigem escolha explícita", () => {
    expect(issueFromUnavailableReason("provider_error")).toEqual({ type: "technical", cause: "provider_error" });
    expect(issueFromUnavailableReason("not_configured")).toEqual({ type: "technical", cause: "not_configured" });
    expect(issueFromError("network")).toEqual({ type: "technical", cause: "network" });
    expect(issueFromError("timeout")).toEqual({ type: "technical", cause: "timeout" });
    expect(issueFromError("rate_limited")).toEqual({ type: "technical", cause: "rate_limited" });
    expect(issueFromError("server")).toEqual({ type: "technical", cause: "server" });
  });

  it("CEP inválido NUNCA permite 'a combinar': só conferir o CEP", () => {
    for (const issue of [issueFromUnavailableReason("invalid_destination"), issueFromError("invalid_postal_code")]) {
      expect(issue).toEqual({ type: "invalid_destination" });
      expect(actionsOf(issue)).toEqual(["checkPostalCode"]);
    }
  });

  it("falha técnica oferece exatamente 'Tentar de novo' e 'Fechar o pedido com frete a combinar'", () => {
    for (const kind of ["network", "timeout", "rate_limited", "server"] as const) {
      expect(actionsOf(issueFromError(kind))).toEqual(["retry", "closeArranged"]);
    }
    expect(actionsOf(issueFromUnavailableReason("provider_error"))).toEqual(["retry", "closeArranged"]);
    expect(actionsOf(issueFromUnavailableReason("not_configured"))).toEqual(["retry", "closeArranged"]);
  });

  it("'a combinar' automático não pede nenhuma ação (o pedido segue normalmente)", () => {
    for (const reason of ["over_limits", "no_rates_configured", "incomplete_product_data"]) {
      expect(actionsOf(issueFromUnavailableReason(reason))).toEqual([]);
    }
  });

  it("peça indisponível: revisar o pedido, sem 'a combinar'", () => {
    expect(issueFromError("product_unavailable")).toEqual({ type: "product_unavailable" });
    expect(actionsOf({ type: "product_unavailable" })).toEqual(["reviewCart"]);
  });

  it("over_limits explica que o frete da peça é combinado pelo atendimento", () => {
    expect(locales.ptBR.shipping.issue.over_limits).toMatch(/a combinar com nosso atendimento/);
    expect(locales.en.shipping.issue.over_limits).toMatch(/arranged with our team/);
  });

  it("código desconhecido (backend novo) cai em falha técnica, sem quebrar", () => {
    expect(issueFromUnavailableReason("algo_novo")).toEqual({ type: "technical", cause: "provider_error" });
  });

  it("toda ação referenciada tem rótulo nos dois idiomas", () => {
    const actions = new Set<ShippingAction>();
    const issues: ShippingIssue[] = [
      ...[...UNAVAILABLE_REASONS].map(issueFromUnavailableReason),
      ...ERROR_KINDS.map(issueFromError),
    ];
    issues.forEach((issue) => actionsOf(issue).forEach((a) => actions.add(a)));
    for (const action of actions) {
      expect(typeof lookup(locales.ptBR, `shipping.actions.${action}`)).toBe("string");
      expect(typeof lookup(locales.en, `shipping.actions.${action}`)).toBe("string");
    }
    expect(lookup(locales.ptBR, "shipping.actions.closeArranged")).toBe("Fechar o pedido com frete a combinar");
    expect(lookup(locales.ptBR, "shipping.actions.retry")).toBe("Tentar de novo");
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

  it("toda falha vira uma situação com mensagem nos dois idiomas", () => {
    for (const kind of ["rate_limited", "invalid_postal_code", "product_unavailable", "network", "timeout", "server"] as const) {
      const { messageKey } = describeIssue(issueFromError(kind));
      expect(typeof lookup(locales.ptBR, messageKey), kind).toBe("string");
      expect(typeof lookup(locales.en, messageKey), kind).toBe("string");
    }
  });
});
