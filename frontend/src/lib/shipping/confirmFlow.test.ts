import { describe, expect, it, vi } from "vitest";
import {
  applyQuote,
  canProceedToCheckout,
  confirmShipping,
  describeChange,
  destinationState,
  isReadyToConfirm,
  withArrangeChoice,
  type ConfirmDeps,
} from "./confirmFlow";
import { cartSignature } from "./cartSignature";
import { QUOTE_CACHE_TTL_MS, type StoredShipping } from "./storage";
import { resolveShippingSummary } from "./summary";
import type { ShippingOption, ShippingQuoteRequest, ShippingQuoteResult, ShippingUnavailableReason } from "./types";

const NOW = 1_800_000_000_000;
const ITEMS = [{ productId: "p1", quantity: 2 }];
const SIG = cartSignature(ITEMS);

const pac = (priceBRL = 30): ShippingOption => ({ id: "pac", carrier: "Correios", service: "PAC", priceBRL, deliveryDaysMin: 5, deliveryDaysMax: 8, kind: "quoted" });
const sedex: ShippingOption = { id: "sedex", carrier: "Correios", service: "SEDEX", priceBRL: 50, deliveryDaysMin: 1, deliveryDaysMax: 2, kind: "quoted" };
const dhl: ShippingOption = { id: "intl-1", carrier: "DHL", service: "DHL", priceBRL: 210, deliveryDaysMin: 7, deliveryDaysMax: 15, kind: "quoted" };

const ok = (options: ShippingOption[], over: Partial<ShippingQuoteResult> = {}): ShippingQuoteResult => ({
  destination: { country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP" },
  mode: "domestic", options, requiresConfirmation: false, notice: null, unavailable: null, ...over,
});
const unavailable = (reason: ShippingUnavailableReason, over: Partial<ShippingQuoteResult> = {}) => ok([], { unavailable: { reason }, ...over });

function stored(over: Partial<StoredShipping> = {}): StoredShipping {
  return {
    version: 2, country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP",
    quote: { result: ok([pac(), sedex]), signature: SIG, savedAt: NOW }, selection: "pac", arrangeChoice: null, ...over,
  };
}
const expiredQuote = (result: ShippingQuoteResult, selection: string | null = "pac") => ({
  quote: { result, signature: SIG, savedAt: NOW - QUOTE_CACHE_TTL_MS - 1 }, selection,
});

function deps(fetchQuote: ConfirmDeps["fetchQuote"], over: Partial<ConfirmDeps> = {}): ConfirmDeps {
  return { fetchQuote, now: () => NOW, isCurrent: () => true, ...over };
}
const api = (status: number, message: string) => Object.assign(new Error(message), { status });
const neverCalled = () => vi.fn<ConfirmDeps["fetchQuote"]>(async () => {
  throw new Error("não devia consultar o frete");
});

describe("estados em que o pedido pode ser confirmado SEM recalcular", () => {
  it("frete cotado e válido (menos de 10 min, mesmo carrinho, opção escolhida)", async () => {
    const fetchQuote = neverCalled();
    const out = await confirmShipping(stored(), ITEMS, deps(fetchQuote));
    expect(out).toMatchObject({ type: "send", summary: { kind: "quoted", option: { id: "pac" }, fresh: true } });
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it.each(["over_limits", "no_rates_configured", "incomplete_product_data"] as const)("%s (a combinar permitido)", async (reason) => {
    const fetchQuote = neverCalled();
    const s = stored({ quote: { result: unavailable(reason), signature: SIG, savedAt: NOW }, selection: null });
    const out = await confirmShipping(s, ITEMS, deps(fetchQuote));
    expect(out).toMatchObject({ type: "send", summary: { kind: "arrange", reason } });
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("falha técnica com escolha EXPLÍCITA de 'a combinar' do comprador", async () => {
    const fetchQuote = neverCalled();
    const s = withArrangeChoice(stored({ quote: null, selection: null }), SIG, "network", NOW);
    const out = await confirmShipping(s, ITEMS, deps(fetchQuote));
    expect(out).toMatchObject({ type: "send", summary: { kind: "arrange", reason: "technical_choice" } });
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("isReadyToConfirm: só cotado/a combinar E dentro dos 10 minutos", () => {
    expect(isReadyToConfirm(resolveShippingSummary(stored(), SIG, NOW))).toBe(true);
    expect(isReadyToConfirm(resolveShippingSummary(stored(), SIG, NOW + QUOTE_CACHE_TTL_MS))).toBe(false);
    expect(isReadyToConfirm({ kind: "none" })).toBe(false);
  });
});

describe("cotação ausente, vencida ou carrinho alterado: recalcula na hora, sem abrir o WhatsApp", () => {
  it("vencida (> 10 min) com o MESMO valor: recalcula e envia", async () => {
    const fetchQuote = vi.fn(async () => ok([pac(), sedex]));
    const out = await confirmShipping(stored(expiredQuote(ok([pac(), sedex]))), ITEMS, deps(fetchQuote));
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ type: "send", summary: { kind: "quoted", fresh: true, option: { priceBRL: 30 } } });
    // a cotação nova é guardada com o horário de agora
    expect(out.type === "send" && out.stored.quote?.savedAt).toBe(NOW);
  });

  it("vencida e o valor MUDOU: não envia, mostra 'de X para Y' e exige novo clique", async () => {
    const fetchQuote = vi.fn(async () => ok([pac(35), sedex]));
    const out = await confirmShipping(stored(expiredQuote(ok([pac(), sedex]))), ITEMS, deps(fetchQuote));
    expect(out.type).toBe("changed");
    if (out.type !== "changed") return;
    expect(out.change).toEqual({ kind: "price", fromBRL: 30, toBRL: 35 });
    expect(out.summary).toMatchObject({ kind: "quoted", fresh: true, option: { priceBRL: 35 } });

    // novo clique: agora a cotação é válida e o pedido segue, sem consultar de novo
    const again = neverCalled();
    expect(await confirmShipping(out.stored, ITEMS, deps(again))).toMatchObject({ type: "send", summary: { option: { priceBRL: 35 } } });
    expect(again).not.toHaveBeenCalled();
  });

  it("valor que ficou MENOR também exige novo clique", async () => {
    const out = await confirmShipping(stored(expiredQuote(ok([pac(), sedex]))), ITEMS, deps(async () => ok([pac(25), sedex])));
    expect(out).toMatchObject({ type: "changed", change: { kind: "price", fromBRL: 30, toBRL: 25 } });
  });

  it("cotação ausente: calcula, mostra o valor e exige um clique (o comprador ainda não tinha visto o valor)", async () => {
    const fetchQuote = vi.fn(async () => ok([pac(), sedex]));
    const out = await confirmShipping(stored({ quote: null, selection: null }), ITEMS, deps(fetchQuote));
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ type: "changed", change: { kind: "calculated", toBRL: 30, label: { service: "PAC" } } });
  });

  it("carrinho alterado (assinatura diferente): o preço antigo não vale; recalcula", async () => {
    const other = stored({ quote: { result: ok([pac(99)]), signature: "outro:1", savedAt: NOW } });
    const fetchQuote = vi.fn(async () => ok([pac(), sedex]));
    const out = await confirmShipping(other, ITEMS, deps(fetchQuote));
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ type: "changed", summary: { option: { priceBRL: 30 } } });
  });

  it("monta o pedido de cotação com país, CEP só com dígitos e os itens do carrinho", async () => {
    const fetchQuote = vi.fn<(r: ShippingQuoteRequest) => Promise<ShippingQuoteResult>>(async () => ok([pac()]));
    await confirmShipping(stored({ quote: null, selection: null, postalCode: "01001-000" }), ITEMS, deps(fetchQuote));
    expect(fetchQuote).toHaveBeenCalledWith({ country: "BR", postalCode: "01001000", items: [{ productId: "p1", quantity: 2 }] });
  });

  it("exterior: código postal é opcional (omitido quando vazio) e mantido quando existe", async () => {
    const fetchQuote = vi.fn<(r: ShippingQuoteRequest) => Promise<ShippingQuoteResult>>(async () => ok([dhl], { mode: "international", notice: "taxes_not_included" }));
    await confirmShipping(stored({ quote: null, selection: null, country: "US", postalCode: "" }), ITEMS, deps(fetchQuote));
    expect(fetchQuote).toHaveBeenLastCalledWith({ country: "US", items: [{ productId: "p1", quantity: 2 }] });
    await confirmShipping(stored({ quote: null, selection: null, country: "US", postalCode: " 10001 " }), ITEMS, deps(fetchQuote));
    expect(fetchQuote).toHaveBeenLastCalledWith({ country: "US", postalCode: "10001", items: [{ productId: "p1", quantity: 2 }] });
  });

  it("a opção escolhida sumiu da cotação nova: cai na mais barata e avisa (não envia)", async () => {
    const s = stored({ ...expiredQuote(ok([pac(), sedex]), "sedex"), selection: "sedex" });
    const out = await confirmShipping(s, ITEMS, deps(async () => ok([pac()])));
    expect(out).toMatchObject({ type: "changed", change: { kind: "calculated", toBRL: 30 } });
  });

  it("vencida: de 'cotado' para 'a combinar' (over_limits) também exige novo clique", async () => {
    const out = await confirmShipping(stored(expiredQuote(ok([pac()]))), ITEMS, deps(async () => unavailable("over_limits")));
    expect(out).toMatchObject({ type: "changed", change: { kind: "arrange", reason: "over_limits" } });
  });

  it("vencida e continua 'a combinar' pelo mesmo motivo: envia", async () => {
    const s = stored({ quote: { result: unavailable("over_limits"), signature: SIG, savedAt: NOW - QUOTE_CACHE_TTL_MS - 1 }, selection: null });
    const out = await confirmShipping(s, ITEMS, deps(async () => unavailable("over_limits")));
    expect(out).toMatchObject({ type: "send", summary: { kind: "arrange", reason: "over_limits" } });
  });

  it("exterior: recalculo com valor igual envia, com valor diferente pede novo clique", async () => {
    const base = stored({
      country: "US",
      ...expiredQuote(ok([dhl], { mode: "international", notice: "taxes_not_included" }), "intl-1"),
    });
    expect((await confirmShipping(base, ITEMS, deps(async () => ok([dhl], { mode: "international", notice: "taxes_not_included" })))).type).toBe("send");
    expect(
      await confirmShipping(base, ITEMS, deps(async () => ok([{ ...dhl, priceBRL: 230 }], { mode: "international", notice: "taxes_not_included" })))
    ).toMatchObject({ type: "changed", change: { kind: "price", fromBRL: 210, toBRL: 230 } });
  });
});

describe("recálculo que falha: nunca envia e cai na falha técnica", () => {
  const expired = stored(expiredQuote(ok([pac(), sedex])));

  it.each([
    ["rede (TypeError)", () => new TypeError("Failed to fetch"), "network"],
    ["timeout (AbortError)", () => Object.assign(new Error("aborted"), { name: "AbortError" }), "timeout"],
    ["429", () => api(429, "Muitas requisições"), "rate_limited"],
    ["500", () => api(500, "Erro interno do servidor"), "server"],
  ])("%s", async (_label, makeError, cause) => {
    const out = await confirmShipping(expired, ITEMS, deps(async () => Promise.reject(makeError())));
    expect(out).toEqual({ type: "technical_failure", cause });
  });

  it.each(["provider_error", "not_configured"] as const)("resposta 'indisponível' %s é falha técnica", async (reason) => {
    expect(await confirmShipping(expired, ITEMS, deps(async () => unavailable(reason)))).toEqual({ type: "technical_failure", cause: reason });
  });

  it("depois da falha, o comprador escolhe 'a combinar' explicitamente e então o pedido segue", async () => {
    const failed = await confirmShipping(expired, ITEMS, deps(async () => Promise.reject(new TypeError("offline"))));
    expect(failed.type).toBe("technical_failure");
    if (failed.type !== "technical_failure") return;

    const chosen = withArrangeChoice(expired, SIG, failed.cause, NOW);
    const fetchQuote = neverCalled();
    expect(await confirmShipping(chosen, ITEMS, deps(fetchQuote))).toMatchObject({ type: "send", summary: { kind: "arrange", reason: "technical_choice" } });
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("'Tentar de novo' que funciona: volta ao fluxo normal", async () => {
    const out = await confirmShipping(expired, ITEMS, deps(async () => ok([pac(), sedex])));
    expect(out.type).toBe("send");
  });
});

describe("CEP inválido e peça indisponível NÃO permitem 'a combinar'", () => {
  const expired = stored(expiredQuote(ok([pac()])));

  it("unavailable invalid_destination", async () => {
    expect(await confirmShipping(expired, ITEMS, deps(async () => unavailable("invalid_destination")))).toEqual({
      type: "blocked",
      issue: { type: "invalid_destination" },
    });
  });

  it("400 'CEP inválido'", async () => {
    expect(await confirmShipping(expired, ITEMS, deps(async () => Promise.reject(api(400, "CEP inválido: informe 8 dígitos"))))).toEqual({
      type: "blocked",
      issue: { type: "invalid_destination" },
    });
  });

  it("400 produto não encontrado ou inativo", async () => {
    expect(await confirmShipping(expired, ITEMS, deps(async () => Promise.reject(api(400, "Produto p1 não encontrado ou inativo"))))).toEqual({
      type: "blocked",
      issue: { type: "product_unavailable" },
    });
  });

  it("escolha de 'a combinar' guardada de outro carrinho não destrava o pedido", async () => {
    const s = withArrangeChoice(stored({ quote: null, selection: null }), "outro:1", "network", NOW);
    const out = await confirmShipping(s, ITEMS, deps(async () => unavailable("invalid_destination")));
    expect(out.type).toBe("blocked");
  });
});

describe("destino incompleto e respostas atrasadas", () => {
  it("Brasil sem CEP completo e sem frete: precisa voltar ao carrinho, sem consultar", async () => {
    const fetchQuote = neverCalled();
    const out = await confirmShipping(stored({ quote: null, selection: null, postalCode: "0100" }), ITEMS, deps(fetchQuote));
    expect(out).toEqual({ type: "needs_destination" });
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("destinationState: Brasil exige 8 dígitos; exterior só o país", () => {
    expect(destinationState("BR", "01001-000")).toBe("complete");
    expect(destinationState("BR", "")).toBe("incomplete");
    expect(destinationState("US", "")).toBe("complete");
  });

  it("resposta atrasada (outra requisição começou) é DESCARTADA, com sucesso ou com erro", async () => {
    const s = stored(expiredQuote(ok([pac()])));
    expect(await confirmShipping(s, ITEMS, deps(async () => ok([pac(99)]), { isCurrent: () => false }))).toEqual({ type: "discarded" });
    expect(await confirmShipping(s, ITEMS, deps(async () => Promise.reject(new TypeError("x")), { isCurrent: () => false }))).toEqual({ type: "discarded" });
  });

  it("descarta se ficou obsoleta DURANTE a espera (isCurrent muda depois da chamada)", async () => {
    let current = true;
    const out = await confirmShipping(stored(expiredQuote(ok([pac()]))), ITEMS, deps(async () => {
      current = false;
      return ok([pac(99)]);
    }, { isCurrent: () => current }));
    expect(out).toEqual({ type: "discarded" });
  });
});

describe("helpers de estado", () => {
  it("canProceedToCheckout: o carrinho só avança com frete utilizável", () => {
    expect(canProceedToCheckout({ kind: "none" })).toBe(false);
    expect(canProceedToCheckout(resolveShippingSummary(stored(), SIG, NOW))).toBe(true);
    expect(canProceedToCheckout(resolveShippingSummary(stored(), SIG, NOW + QUOTE_CACHE_TTL_MS))).toBe(true); // vencido: o checkout recalcula
  });

  it("applyQuote guarda a cotação, mantém a escolha anterior que ainda existe e limpa a escolha de 'a combinar'", () => {
    const before = withArrangeChoice(stored({ selection: "sedex" }), SIG, "network", NOW);
    const after = applyQuote(before, ok([pac(), sedex]), SIG, NOW + 5);
    expect(after.selection).toBe("sedex");
    expect(after.arrangeChoice).toBeNull();
    expect(after.quote).toMatchObject({ signature: SIG, savedAt: NOW + 5 });
  });

  it("applyQuote com cotação indisponível: nada selecionado", () => {
    expect(applyQuote(stored(), unavailable("over_limits"), SIG, NOW).selection).toBeNull();
  });

  it("describeChange", () => {
    const from = resolveShippingSummary(stored(), SIG, NOW);
    const same = resolveShippingSummary(stored({ quote: { result: ok([pac(40), sedex]), signature: SIG, savedAt: NOW } }), SIG, NOW);
    expect(describeChange(from, same as never)).toEqual({ kind: "price", fromBRL: 30, toBRL: 40 });
    const other = resolveShippingSummary(stored({ selection: "sedex" }), SIG, NOW);
    expect(describeChange(from, other as never)).toMatchObject({ kind: "calculated", toBRL: 50 });
    expect(describeChange({ kind: "none" }, { kind: "arrange", reason: "over_limits", international: false, fresh: true })).toEqual({ kind: "arrange", reason: "over_limits" });
  });
});
