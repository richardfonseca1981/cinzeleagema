import { describe, expect, it } from "vitest";
import { INITIAL_QUOTE_STATE, quoteReducer, type QuoteState } from "./quoteState";
import type { ShippingQuoteResult } from "./types";

const result = (city: string): ShippingQuoteResult => ({
  destination: { country: "BR", postalCode: "01001000", city, state: "SP" },
  mode: "domestic", options: [], requiresConfirmation: false, notice: null, unavailable: null,
});

describe("quoteReducer — transições", () => {
  it("inicial → carregando → sucesso", () => {
    let s: QuoteState = INITIAL_QUOTE_STATE;
    expect(s).toEqual({ status: "idle" });
    s = quoteReducer(s, { type: "request", requestId: 1 });
    expect(s).toEqual({ status: "loading", requestId: 1 });
    s = quoteReducer(s, { type: "success", requestId: 1, result: result("A"), signature: "sig" });
    expect(s).toMatchObject({ status: "success", requestId: 1, signature: "sig" });
  });

  it("carregando → erro", () => {
    let s = quoteReducer(INITIAL_QUOTE_STATE, { type: "request", requestId: 1 });
    s = quoteReducer(s, { type: "failure", requestId: 1, error: "network" });
    expect(s).toEqual({ status: "error", requestId: 1, error: "network" });
  });

  it("erro → nova tentativa → sucesso", () => {
    let s = quoteReducer(INITIAL_QUOTE_STATE, { type: "request", requestId: 1 });
    s = quoteReducer(s, { type: "failure", requestId: 1, error: "timeout" });
    s = quoteReducer(s, { type: "request", requestId: 2 });
    expect(s.status).toBe("loading");
    s = quoteReducer(s, { type: "success", requestId: 2, result: result("B"), signature: "s2" });
    expect(s.status).toBe("success");
  });

  it("restaurar (do localStorage) e zerar", () => {
    const restored = quoteReducer(INITIAL_QUOTE_STATE, { type: "restore", result: result("C"), signature: "s" });
    expect(restored).toMatchObject({ status: "success", signature: "s" });
    expect(quoteReducer(restored, { type: "reset" })).toEqual({ status: "idle" });
  });
});

describe("quoteReducer — respostas atrasadas são descartadas", () => {
  it("resposta da requisição 1 chega DEPOIS de a 2 começar: ignorada", () => {
    let s = quoteReducer(INITIAL_QUOTE_STATE, { type: "request", requestId: 1 });
    s = quoteReducer(s, { type: "request", requestId: 2 });
    const afterLate = quoteReducer(s, { type: "success", requestId: 1, result: result("VELHA"), signature: "velha" });
    expect(afterLate).toBe(s); // mesmo objeto: nada mudou
    expect(afterLate).toEqual({ status: "loading", requestId: 2 });
  });

  it("a resposta certa (2) é aplicada normalmente depois da atrasada (1) ser ignorada", () => {
    let s = quoteReducer(INITIAL_QUOTE_STATE, { type: "request", requestId: 1 });
    s = quoteReducer(s, { type: "request", requestId: 2 });
    s = quoteReducer(s, { type: "success", requestId: 1, result: result("VELHA"), signature: "velha" });
    s = quoteReducer(s, { type: "success", requestId: 2, result: result("NOVA"), signature: "nova" });
    expect(s).toMatchObject({ status: "success", requestId: 2, signature: "nova" });
    expect((s as Extract<QuoteState, { status: "success" }>).result.destination.city).toBe("NOVA");
  });

  it("erro atrasado da requisição antiga não derruba uma cotação mais nova que já deu certo", () => {
    let s = quoteReducer(INITIAL_QUOTE_STATE, { type: "request", requestId: 1 });
    s = quoteReducer(s, { type: "request", requestId: 2 });
    s = quoteReducer(s, { type: "success", requestId: 2, result: result("NOVA"), signature: "nova" });
    const afterLateError = quoteReducer(s, { type: "failure", requestId: 1, error: "network" });
    expect(afterLateError).toBe(s);
  });

  it("depois de zerar (destino mudou), qualquer resposta em voo é ignorada", () => {
    let s = quoteReducer(INITIAL_QUOTE_STATE, { type: "request", requestId: 1 });
    s = quoteReducer(s, { type: "reset" });
    expect(quoteReducer(s, { type: "success", requestId: 1, result: result("X"), signature: "x" })).toEqual({ status: "idle" });
  });

  it("resposta de sucesso sem nenhuma requisição em andamento é ignorada", () => {
    expect(quoteReducer(INITIAL_QUOTE_STATE, { type: "success", requestId: 5, result: result("X"), signature: "x" })).toEqual({ status: "idle" });
  });
});
