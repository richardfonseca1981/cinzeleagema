import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_RECALC_DEBOUNCE_MS, createDebouncer, shouldAutoRecalculate } from "./debounce";

describe("createDebouncer (600 ms)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("o intervalo é de 600 ms", () => {
    expect(AUTO_RECALC_DEBOUNCE_MS).toBe(600);
  });

  it("não chama antes do tempo e chama uma vez depois", () => {
    const fn = vi.fn();
    const d = createDebouncer(AUTO_RECALC_DEBOUNCE_MS);
    d.schedule(fn);
    vi.advanceTimersByTime(599);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("várias mudanças seguidas (ex.: clicar + várias vezes) viram UMA chamada, 600 ms depois da última", () => {
    const fn = vi.fn();
    const d = createDebouncer(AUTO_RECALC_DEBOUNCE_MS);
    for (let i = 0; i < 5; i++) {
      d.schedule(fn);
      vi.advanceTimersByTime(300);
    }
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel impede a chamada (ex.: carrinho voltou ao estado cotado, ou saiu da página)", () => {
    const fn = vi.fn();
    const d = createDebouncer(AUTO_RECALC_DEBOUNCE_MS);
    d.schedule(fn);
    d.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("depois de disparar, pode agendar de novo", () => {
    const fn = vi.fn();
    const d = createDebouncer(AUTO_RECALC_DEBOUNCE_MS);
    d.schedule(fn);
    vi.advanceTimersByTime(600);
    d.schedule(fn);
    vi.advanceTimersByTime(600);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("shouldAutoRecalculate — só quando o carrinho muda DEPOIS de já haver cotação", () => {
  const base = { hasQuoted: true, quotedSignature: "a:1", currentSignature: "a:2", cartIsEmpty: false };

  it("carrinho mudou depois de cotar: recalcula", () => {
    expect(shouldAutoRecalculate(base)).toBe(true);
  });

  it("nunca cotou: não recalcula sozinho (nada de chamada sem o comprador pedir)", () => {
    expect(shouldAutoRecalculate({ ...base, hasQuoted: false })).toBe(false);
    expect(shouldAutoRecalculate({ ...base, quotedSignature: null })).toBe(false);
  });

  it("carrinho igual ao cotado: não recalcula", () => {
    expect(shouldAutoRecalculate({ ...base, currentSignature: "a:1" })).toBe(false);
  });

  it("carrinho vazio: não recalcula", () => {
    expect(shouldAutoRecalculate({ ...base, cartIsEmpty: true, currentSignature: "" })).toBe(false);
  });
});
