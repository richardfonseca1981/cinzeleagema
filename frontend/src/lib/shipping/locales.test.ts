import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

// ---- Frete definitivo: textos que não podem mais existir -----------------------------------

function allStrings(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (obj && typeof obj === "object") return Object.values(obj).flatMap(allStrings);
  return [];
}

describe("frete definitivo: nada de estimativa, prévia ou 'a confirmar' (Brasil e exterior)", () => {
  const freight = [
    ...allStrings(locales.ptBR.shipping),
    ...allStrings(locales.en.shipping),
    ...allStrings(locales.ptBR.checkout),
    ...allStrings(locales.en.checkout),
  ];

  it("nenhum texto de frete/checkout fala em estimativa, prévia ou a confirmar", () => {
    for (const text of freight) {
      expect(text, text).not.toMatch(/estimativa|estimado|estimada|prévia|\ba confirmar\b|estimat|preview|to be confirmed/i);
    }
  });

  it("o link e a frase removidos não existem em nenhum idioma", () => {
    const everything = JSON.stringify([locales.ptBR, locales.en]);
    expect(everything).not.toContain("Prefiro combinar o frete pelo WhatsApp");
    expect(everything).not.toContain("Você pode escolher uma opção acima quando quiser");
    expect(everything).not.toMatch(/rather arrange shipping on WhatsApp|pick an option above whenever/i);
    expect(everything).not.toMatch(/Total estimado|Estimated total/);
  });

  it("rótulos do resumo: 'Frete' e 'Total' quando há frete; 'Total (sem frete)' quando a combinar", () => {
    expect(locales.ptBR.shipping.summary.shipping).toBe("Frete");
    expect(locales.ptBR.shipping.summary.total).toBe("Total");
    expect(locales.ptBR.shipping.summary.totalWithoutShipping).toBe("Total (sem frete)");
    expect(locales.en.shipping.summary.shipping).toBe("Shipping");
    expect(locales.en.shipping.summary.total).toBe("Total");
    expect(locales.en.shipping.summary.totalWithoutShipping).toBe("Total (excluding shipping)");
  });

  it("falha técnica: os dois botões, com os textos do cliente", () => {
    expect(locales.ptBR.shipping.actions.retry).toBe("Tentar de novo");
    expect(locales.ptBR.shipping.actions.closeArranged).toBe("Fechar o pedido com frete a combinar");
    expect(locales.en.shipping.actions.retry).toBe("Try again");
  });

  it("o aviso de impostos de importação continua nos dois idiomas", () => {
    expect(locales.ptBR.shipping.taxesNotice).toMatch(/Impostos de importação/);
    expect(locales.en.shipping.taxesNotice).toMatch(/Import taxes/);
    expect(locales.ptBR.checkout.whatsappMessage.taxes).toBe("Impostos de importação não incluídos");
    expect(locales.en.checkout.whatsappMessage.taxes).toBe("Import taxes not included");
  });
});

describe("código-fonte: sem caminho para pular o cálculo e sem string solta", () => {
  const SRC = resolve(__dirname, "../..");
  const read = (rel: string) => readFileSync(resolve(SRC, rel), "utf8");

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }

  it("a calculadora, o carrinho e o checkout não têm mais o link 'combinar pelo WhatsApp' nem a opção 'estimated'", () => {
    for (const file of ["components/shipping/ShippingCalculator.tsx", "pages/Cart.tsx", "pages/Checkout.tsx", "components/shipping/OrderSummary.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/shipping\.arrange\.|ARRANGE_OPTION_ID|chooseArrange\(\)\s*}\s*className|shipping\.estimate|totalEstimated|estimateToConfirm/);
    }
  });

  it("toda chave literal t(\"...\") usada no código existe em pt-BR e en", () => {
    const missing: string[] = [];
    for (const file of walk(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*"([A-Za-z0-9_.]+)"/g)) {
        const key = match[1];
        const has = (tree: unknown) => {
          const node = key.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], tree);
          if (node !== undefined) return true;
          // plurais: "shipping.delivery.days" existe como days_one/days_other
          const parent = key.split(".").slice(0, -1).reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], tree) as Record<string, unknown> | undefined;
          return parent !== undefined && `${key.split(".").at(-1)}_one` in parent;
        };
        if (!has(locales.ptBR)) missing.push(`pt-BR: ${key} (${file.replace(SRC, "")})`);
        if (!has(locales.en)) missing.push(`en: ${key} (${file.replace(SRC, "")})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("as chaves montadas por reason/causa existem para todos os valores possíveis", () => {
    const reasons = ["over_limits", "no_rates_configured", "incomplete_product_data", "technical_choice"];
    const causes = ["provider_error", "not_configured", "rate_limited", "network", "timeout", "server"];
    for (const tree of [locales.ptBR, locales.en]) {
      for (const reason of reasons) {
        expect(typeof (tree.shipping.summary.arrangeHint as Record<string, string>)[reason]).toBe("string");
        expect(typeof (tree.checkout.whatsappMessage.arrangeReason as Record<string, string>)[reason]).toBe("string");
      }
      for (const key of [...causes, "over_limits", "no_rates_configured", "incomplete_product_data", "invalid_destination", "product_unavailable"]) {
        expect(typeof (tree.shipping.issue as Record<string, string>)[key]).toBe("string");
      }
    }
  });
});
