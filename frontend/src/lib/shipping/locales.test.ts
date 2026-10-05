import { describe, expect, it } from "vitest";
import { leafKeys, locales } from "./testHelpers";

// Nenhuma string solta no código: tudo vem dos dois arquivos de idioma, que
// precisam ter exatamente as mesmas chaves e as mesmas variáveis {{...}}.

function valueAt(obj: unknown, path: string): string {
  return path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], obj) as string;
}
const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe.each(["shipping", "cart", "checkout"] as const)("arquivos de idioma — seção %s", (section) => {
  const ptKeys = leafKeys(locales.ptBR[section]).sort();
  const enKeys = leafKeys(locales.en[section]).sort();

  it("pt-BR e en têm exatamente as mesmas chaves", () => {
    expect(enKeys).toEqual(ptKeys);
  });

  it("nenhuma tradução vazia e as mesmas variáveis {{...}} nos dois idiomas", () => {
    for (const key of ptKeys) {
      const pt = valueAt(locales.ptBR[section], key);
      const en = valueAt(locales.en[section], key);
      expect(pt.trim(), `pt-BR ${section}.${key}`).not.toBe("");
      expect(en.trim(), `en ${section}.${key}`).not.toBe("");
      // plurais (_one/_other) só mudam o texto; as variáveis têm de bater
      expect(vars(en), `variáveis de ${section}.${key}`).toEqual(vars(pt));
    }
  });
});

describe("prazo: nunca afirma 'dias úteis' (unidade não confirmada na documentação do provedor)", () => {
  it("nenhum texto de frete usa 'úteis' / 'business days'", () => {
    const all = JSON.stringify([locales.ptBR.shipping, locales.en.shipping, locales.ptBR.checkout.whatsappMessage, locales.en.checkout.whatsappMessage]);
    expect(all).not.toMatch(/úteis|business day|working day/i);
  });
});
