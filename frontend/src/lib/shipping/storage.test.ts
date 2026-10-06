import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  QUOTE_CACHE_TTL_MS,
  SHIPPING_STORAGE_KEY,
  clearStoredQuote,
  isQuoteValid,
  loadStoredShipping,
  parseStoredShipping,
  saveStoredShipping,
  type StoredQuote,
  type StoredShipping,
} from "./storage";
import type { ShippingQuoteResult } from "./types";

const result: ShippingQuoteResult = {
  destination: { country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP" },
  mode: "domestic",
  options: [{ id: "1", carrier: "Correios", service: "PAC", priceBRL: 30, deliveryDaysMin: 5, deliveryDaysMax: 8, kind: "quoted" }],
  requiresConfirmation: false,
  notice: null,
  unavailable: null,
};
const NOW = 1_800_000_000_000;
const quote = (over: Partial<StoredQuote> = {}): StoredQuote => ({ result, signature: "a:1", savedAt: NOW, ...over });
const stored = (over: Partial<StoredShipping> = {}): StoredShipping => ({
  version: 2, country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP", quote: quote(), selection: "1", arrangeChoice: null, ...over,
});

describe("isQuoteValid — assinatura do carrinho e tempo", () => {
  it("vale com a mesma assinatura e menos de 10 minutos", () => {
    expect(isQuoteValid(quote(), "a:1", NOW + 1000)).toBe(true);
    expect(isQuoteValid(quote(), "a:1", NOW + QUOTE_CACHE_TTL_MS - 1)).toBe(true);
  });

  it("vence com 10 minutos ou mais", () => {
    expect(isQuoteValid(quote(), "a:1", NOW + QUOTE_CACHE_TTL_MS)).toBe(false);
    expect(isQuoteValid(quote(), "a:1", NOW + 2 * QUOTE_CACHE_TTL_MS)).toBe(false);
  });

  it("não vale com outra assinatura (carrinho mudou), mesmo recente", () => {
    expect(isQuoteValid(quote(), "a:2", NOW + 1000)).toBe(false);
    expect(isQuoteValid(quote(), "", NOW + 1000)).toBe(false);
  });

  it("não vale sem cotação nem com horário no futuro (relógio alterado)", () => {
    expect(isQuoteValid(null, "a:1", NOW)).toBe(false);
    expect(isQuoteValid(quote({ savedAt: NOW + 10_000 }), "a:1", NOW)).toBe(false);
  });

  it("o limite é de 10 minutos, com o mesmo nome e valor do cache do backend (QUOTE_CACHE_TTL_MS)", () => {
    expect(QUOTE_CACHE_TTL_MS).toBe(10 * 60 * 1000);
    const backend = readFileSync(resolve(__dirname, "../../../../backend/src/lib/shipping/quoteCache.ts"), "utf8");
    expect(backend).toMatch(/export const QUOTE_CACHE_TTL_MS = 10 \* 60 \* 1000;/);
  });
});

describe("parseStoredShipping — dado do disco pode estar corrompido", () => {
  it("lê um estado válido", () => {
    expect(parseStoredShipping(JSON.stringify(stored()))).toEqual(stored());
  });

  it("devolve null para vazio, lixo, versão desconhecida ou campos faltando", () => {
    expect(parseStoredShipping(null)).toBeNull();
    expect(parseStoredShipping("")).toBeNull();
    expect(parseStoredShipping("{não é json")).toBeNull();
    expect(parseStoredShipping(JSON.stringify({ version: 3, country: "BR", postalCode: "" }))).toBeNull();
    expect(parseStoredShipping(JSON.stringify({ version: 1, country: 5 }))).toBeNull();
  });

  it("versão 1 (antes do frete definitivo): aproveita só país e CEP; cotação e 'a combinar' antigos saem", () => {
    const v1 = { ...stored(), version: 1, selection: "__arrange__" };
    expect(parseStoredShipping(JSON.stringify(v1))).toEqual({
      version: 2, country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP", quote: null, selection: null, arrangeChoice: null,
    });
  });

  it("escolha de 'a combinar' malformada é descartada", () => {
    const ok = { signature: "a:1", cause: "network", chosenAt: NOW };
    expect(parseStoredShipping(JSON.stringify({ ...stored(), arrangeChoice: ok }))?.arrangeChoice).toEqual(ok);
    expect(parseStoredShipping(JSON.stringify({ ...stored(), arrangeChoice: { ...ok, cause: "invalid_destination" } }))?.arrangeChoice).toBeNull();
    expect(parseStoredShipping(JSON.stringify({ ...stored(), arrangeChoice: { signature: 1 } }))?.arrangeChoice).toBeNull();
  });

  it("descarta só a cotação quando ela está malformada, mantendo país e CEP", () => {
    const parsed = parseStoredShipping(JSON.stringify({ ...stored(), quote: { signature: 1 } }));
    expect(parsed).toMatchObject({ country: "BR", postalCode: "01001000", quote: null });
  });
});

describe("localStorage sempre em try/catch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sem localStorage (ou bloqueado): load devolve null e save/clear não lançam", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    });
    expect(loadStoredShipping()).toBeNull();
    expect(() => saveStoredShipping(stored())).not.toThrow();
    expect(() => clearStoredQuote()).not.toThrow();
  });

  it("clearStoredQuote limpa cotação e escolha, mas mantém país e CEP", () => {
    const withChoice = stored({ arrangeChoice: { signature: "a:1", cause: "network", chosenAt: NOW } });
    const store = new Map<string, string>([[SHIPPING_STORAGE_KEY, JSON.stringify(withChoice)]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });

    clearStoredQuote();

    expect(JSON.parse(store.get(SHIPPING_STORAGE_KEY)!)).toMatchObject({ country: "BR", postalCode: "01001000", quote: null, selection: null, arrangeChoice: null });
  });
});
