import { beforeAll, describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import type { CartItem } from "../../types";
import { buildWhatsAppMessage } from "./whatsappMessage";
import { destinationFor, resolveShippingSummary } from "./summary";
import type { StoredShipping } from "./storage";
import { ARRANGE_OPTION_ID, type ShippingOption } from "./types";
import { makeT } from "./testHelpers";

const NOW = 1_800_000_000_000;
const items: CartItem[] = [
  { productId: "p1", name: "Esmeralda", nameEn: "Emerald", unitPrice: 100, imageUrl: null, weightGrams: 2, sizeCm: 1, quantity: 2 },
  { productId: "p2", name: "Quartzo", nameEn: null, unitPrice: 50, imageUrl: null, weightGrams: 0, sizeCm: 0, quantity: 1 },
]; // subtotal R$ 250,00

const pac: ShippingOption = { id: "pac", carrier: "Correios", service: "PAC", priceBRL: 45, deliveryDaysMin: 5, deliveryDaysMax: 8, kind: "quoted" };
const noDays: ShippingOption = { ...pac, id: "nd", deliveryDaysMin: null, deliveryDaysMax: null };
const est: ShippingOption = { id: "est", carrier: "Tabela", service: "Aéreo", priceBRL: 210, deliveryDaysMin: 7, deliveryDaysMax: 15, kind: "estimated" };

function stored(over: Partial<StoredShipping> & { options?: ShippingOption[]; mode?: "domestic" | "international"; notice?: "taxes_not_included" | null }): StoredShipping {
  const { options = [pac], mode = "domestic", notice = null, ...rest } = over;
  return {
    version: 1, country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP",
    quote: {
      result: { destination: { country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP" }, mode, options, requiresConfirmation: mode === "international", notice, unavailable: null },
      signature: "sig", savedAt: NOW,
    },
    selection: options[0]?.id ?? null,
    ...rest,
  };
}

let pt: TFunction;
let en: TFunction;
beforeAll(async () => {
  pt = await makeT("pt-BR");
  en = await makeT("en");
});

function build(lang: "pt-BR" | "en", s: StoredShipping | null, rate: number | null = null, sig = "sig") {
  const summary = resolveShippingSummary(s, sig, NOW + 1000);
  // toLocaleString usa espaço não separável após "R$": normaliza para comparar.
  return normalizeSpaces(
    buildWhatsAppMessage({
      t: lang === "en" ? en : pt, lang, exchangeRate: rate, items, summary,
      destination: destinationFor(s, summary), customerName: "Maria", customerPhone: "+5514988095356",
    })
  );
}

describe("mensagem do WhatsApp — português (valores em R$)", () => {
  it("frete cotado: destino, serviço com preço e prazo, e o total", () => {
    const msg = build("pt-BR", stored({}));
    expect(msg.split("\n")).toEqual([
      "Olá! Gostaria de fazer um pedido:",
      "• 2x Esmeralda (2g · 1cm) — R$ 200,00",
      "• 1x Quartzo — R$ 50,00",
      "Subtotal: R$ 250,00",
      "Destino: Brasil, CEP 01001-000 — São Paulo, SP",
      "Frete: Correios — PAC: R$ 45,00 (5 a 8 dias)",
      "Total (produtos + frete): R$ 295,00",
      "Nome: Maria",
      "Telefone: +5514988095356",
    ]);
  });

  it("frete cotado sem prazo: omite os parênteses", () => {
    const msg = build("pt-BR", stored({ options: [noDays] }));
    expect(msg).toContain("Frete: Correios — PAC: R$ 45,00\n");
    expect(msg).not.toContain("()");
  });

  it("frete estimado: 'a confirmar pelo atendimento', total estimado, sem impostos (destino nacional)", () => {
    const msg = build("pt-BR", stored({ options: [est] }));
    expect(msg).toContain("Frete estimado, a confirmar pelo atendimento: Tabela — Aéreo: R$ 210,00 (7 a 15 dias)");
    expect(msg).toContain("Total estimado (produtos + frete estimado): R$ 460,00");
    expect(msg).not.toMatch(/Impostos/);
  });

  it("a combinar (escolha do comprador)", () => {
    const msg = build("pt-BR", stored({ selection: ARRANGE_OPTION_ID }));
    expect(msg).toContain("Frete: a combinar pelo atendimento");
    expect(msg).toContain("Total estimado (sem frete): R$ 250,00");
    expect(msg).toContain("Destino: Brasil, CEP 01001-000 — São Paulo, SP");
    expect(msg).not.toMatch(/Impostos/);
  });

  it("sem calcular nada (o frete nunca bloqueia): a combinar e sem linha de destino", () => {
    const msg = build("pt-BR", null);
    expect(msg).toContain("Frete: a combinar pelo atendimento");
    expect(msg).not.toMatch(/Destino/);
  });

  it("cotação vencida: não usa o preço antigo, vira 'a combinar'", () => {
    const msg = build("pt-BR", stored({}), null, "outra-assinatura");
    expect(msg).toContain("Frete: a combinar pelo atendimento");
    expect(msg).not.toContain("R$ 45,00");
    expect(msg).toContain("Total estimado (sem frete): R$ 250,00");
  });

  it("destino internacional: frete estimado a confirmar + impostos de importação não incluídos", () => {
    const msg = build("pt-BR", stored({ country: "US", postalCode: "10001", city: null, state: null, selection: ARRANGE_OPTION_ID, mode: "international", notice: "taxes_not_included" }));
    expect(msg).toContain("Destino: Estados Unidos, código postal 10001");
    expect(msg).toContain("Frete estimado, a confirmar pelo atendimento\n");
    expect(msg).toContain("Impostos de importação não incluídos");
    expect(msg).toContain("Total estimado (sem frete): R$ 250,00");
  });

  it("internacional sem código postal: só o país", () => {
    const msg = build("pt-BR", stored({ country: "PT", postalCode: "", city: null, state: null, selection: ARRANGE_OPTION_ID }));
    expect(msg).toContain("Destino: Portugal\n");
  });

  it("internacional com opção estimada: preço, 'a confirmar' e impostos", () => {
    const msg = build("pt-BR", stored({ country: "US", postalCode: "10001", city: null, state: null, options: [est], mode: "international", notice: "taxes_not_included" }));
    expect(msg).toContain("Frete estimado, a confirmar pelo atendimento: Tabela — Aéreo: R$ 210,00");
    expect(msg).toContain("Impostos de importação não incluídos");
  });
});

describe("mensagem do WhatsApp — inglês (valores em dólar pela cotação do dia)", () => {
  const RATE = 5;

  it("frete cotado: tudo em dólar, destino e prazo em inglês", () => {
    const msg = build("en", stored({}), RATE);
    expect(msg.split("\n")).toEqual([
      "Hi! I'd like to place an order:",
      "• 2x Emerald (2g · 1cm) — $40.00",
      "• 1x Quartzo — $10.00",
      "Subtotal: $50.00",
      "Destination: Brazil, postal code 01001-000 — São Paulo, SP",
      "Shipping: Correios — PAC: $9.00 (5 to 8 days)",
      "Total (products + shipping): $59.00",
      "Name: Maria",
      "Phone: +5514988095356",
      "",
      "Exchange rate used: US$ 1 = R$ 5.00 (rate of the day)",
    ]);
  });

  it("os valores em dólar da mensagem somam (subtotal + frete = total)", () => {
    const msg = build("en", stored({}), 5.37);
    const money = (label: RegExp) => Number(msg.match(label)![1].replace(/[$,]/g, ""));
    const subtotal = money(/Subtotal: (\$[\d,.]+)/);
    const shipping = money(/Correios — PAC: (\$[\d,.]+)/);
    const total = money(/Total \(products \+ shipping\): (\$[\d,.]+)/);
    expect(Math.round((subtotal + shipping) * 100)).toBe(Math.round(total * 100));
  });

  it("estimado, a combinar e internacional em inglês", () => {
    expect(build("en", stored({ options: [est] }), RATE)).toContain("Estimated shipping, to be confirmed by our team: Tabela — Aéreo: $42.00 (7 to 15 days)");
    expect(build("en", stored({ selection: ARRANGE_OPTION_ID }), RATE)).toContain("Shipping: to be arranged with our team");
    const intl = build("en", stored({ country: "US", postalCode: "10001", city: null, state: null, selection: ARRANGE_OPTION_ID, mode: "international", notice: "taxes_not_included" }), RATE);
    expect(intl).toContain("Destination: United States, postal code 10001");
    expect(intl).toContain("Estimated shipping, to be confirmed by our team\n");
    expect(intl).toContain("Import taxes not included");
    expect(intl).toContain("Estimated total (without shipping): $50.00");
  });

  it("sem cotação do dólar disponível, cai para Real (mesma regra do resto do site)", () => {
    const msg = build("en", stored({}), null);
    expect(msg).toMatch(/Subtotal: R\$\s?250\.00/);
  });
});

// Constrói a mensagem já normalizada, com opções extras (rateStale).
function buildWith(lang: "pt-BR" | "en", s: StoredShipping | null, rate: number | null, extra: { rateStale?: boolean } = {}) {
  const summary = resolveShippingSummary(s, "sig", NOW + 1000);
  return normalizeSpaces(
    buildWhatsAppMessage({
      t: lang === "en" ? en : pt, lang, exchangeRate: rate, items, summary,
      destination: destinationFor(s, summary), customerName: "Maria", customerPhone: "+5514988095356", ...extra,
    })
  );
}

describe("linha informativa da cotação (só em inglês, só com conversão aplicada)", () => {
  const LINE = (rate: string, kind = "rate of the day") => `Exchange rate used: US$ 1 = R$ ${rate} (${kind})`;

  it("inglês com conversão: a linha é a ÚLTIMA, separada por uma linha em branco", () => {
    const lines = buildWith("en", stored({}), 5.32).split("\n");
    expect(lines.at(-1)).toBe(LINE("5.32"));
    expect(lines.at(-2)).toBe("");
    expect(lines.at(-3)).toBe("Phone: +5514988095356");
    expect(lines.filter((l) => l.startsWith("Exchange rate used"))).toHaveLength(1);
  });

  it("inglês SEM conversão (cotação indisponível): mensagem sai em reais e não há linha", () => {
    for (const rate of [null, 0, -1, Number.NaN]) {
      const msg = buildWith("en", stored({}), rate);
      expect(msg, `rate=${rate}`).not.toMatch(/Exchange rate|US\$/);
      expect(msg).toMatch(/Subtotal: R\$\s?250\.00/); // continua em reais
    }
  });

  it("português: nenhuma menção a dólar ou cotação, mesmo com cotação disponível", () => {
    const msg = buildWith("pt-BR", stored({}), 5.32);
    expect(msg).not.toMatch(/US\$|(?<!R)\$\s?\d|dólar|dolar|cota[cç]ão|exchange/i); // "R$" é o esperado; dólar não
    expect(msg.split("\n").at(-1)).toBe("Telefone: +5514988095356");
    expect(msg).toMatch(/Subtotal: R\$ 250,00/);
  });

  it.each([
    [5.3, "5.30"],
    [5.3249, "5.32"],
    [5.325, "5.33"],
    [5.335, "5.34"],
    [5, "5.00"],
    [5.995, "6.00"],
    [4.9999, "5.00"],
    [10.1, "10.10"],
  ])("arredondamento: cotação %s aparece como %s (2 casas, ponto decimal)", (rate, shown) => {
    expect(buildWith("en", stored({}), rate).split("\n").at(-1)).toBe(LINE(shown));
  });

  it("cotação desatualizada (> 24 h): '(approximate rate)' no lugar de '(rate of the day)'", () => {
    const msg = buildWith("en", stored({}), 5.32, { rateStale: true });
    expect(msg.split("\n").at(-1)).toBe(LINE("5.32", "approximate rate"));
    expect(msg).not.toContain("rate of the day");
  });

  it("cotação atual (padrão): '(rate of the day)'", () => {
    expect(buildWith("en", stored({}), 5.32, { rateStale: false }).split("\n").at(-1)).toBe(LINE("5.32"));
    expect(buildWith("en", stored({}), 5.32).split("\n").at(-1)).toBe(LINE("5.32"));
  });

  it("desatualizada MAS sem conversão aplicada: sem linha nenhuma", () => {
    expect(buildWith("en", stored({}), null, { rateStale: true })).not.toMatch(/Exchange rate|approximate/);
  });

  it("o número da linha é EXATAMENTE a cotação que converteu os valores (5.37)", () => {
    const msg = buildWith("en", stored({}), 5.37);
    // R$ 200,00 / 5,37 = 37.24 ; R$ 50,00 / 5,37 = 9.31 ; subtotal R$ 250,00 / 5,37 = 46.55 ; frete R$ 45,00 / 5,37 = 8.38
    expect(msg).toContain("• 2x Emerald (2g · 1cm) — $37.24");
    expect(msg).toContain("• 1x Quartzo — $9.31");
    expect(msg).toContain("Subtotal: $46.55");
    expect(msg).toContain("Correios — PAC: $8.38");
    const shown = Number(msg.split("\n").at(-1)!.match(/R\$ ([\d.]+) \(/)![1]);
    expect(shown).toBe(5.37);
    // refazendo as contas com o número que aparece na linha, saem os MESMOS valores
    expect(Math.round((250 / shown) * 100)).toBe(4655);
    expect(Math.round((200 / shown) * 100)).toBe(3724);
  });

  it("a linha mostra o número arredondado, mas os valores usam a cotação exata (nada é recalculado com o número arredondado)", () => {
    // 250 / 5.3249 = 46.95 ; com o 5.32 mostrado seria 46.99 — a mensagem usa a exata
    const msg = buildWith("en", stored({}), 5.3249);
    expect(msg).toContain("Subtotal: $46.95");
    expect(msg).not.toContain("Subtotal: $46.99");
    expect(msg.split("\n").at(-1)).toBe(LINE("5.32"));
  });

  it("vale para qualquer mensagem em inglês: cotado, estimado, a combinar, internacional, vencido e sem frete", () => {
    const cases: Array<[string, StoredShipping | null, string]> = [
      ["cotado", stored({}), "sig"],
      ["estimado", stored({ options: [est] }), "sig"],
      ["a combinar", stored({ selection: ARRANGE_OPTION_ID }), "sig"],
      ["internacional", stored({ country: "US", postalCode: "10001", city: null, state: null, selection: ARRANGE_OPTION_ID, mode: "international", notice: "taxes_not_included" }), "sig"],
      ["sem frete calculado", null, "sig"],
    ];
    for (const [label, s] of cases.map(([l, st]) => [l, st] as const)) {
      const lines = buildWith("en", s, 5.32).split("\n");
      expect(lines.at(-1), label).toBe(LINE("5.32"));
      expect(lines.at(-2), label).toBe("");
    }
    // cotação vencida (assinatura diferente) também
    const staleSummary = resolveShippingSummary(stored({}), "outra", NOW + 1000);
    const msg = normalizeSpaces(buildWhatsAppMessage({ t: en, lang: "en", exchangeRate: 5.32, items, summary: staleSummary, destination: destinationFor(stored({}), staleSummary), customerName: "Maria", customerPhone: "+55" }));
    expect(msg.split("\n").at(-1)).toBe(LINE("5.32"));
  });

  it("a linha é só informativa: os valores da mensagem são idênticos com ou sem 'rateStale'", () => {
    const strip = (m: string) => m.split("\n").slice(0, -2).join("\n");
    expect(strip(buildWith("en", stored({}), 5.32, { rateStale: true }))).toBe(strip(buildWith("en", stored({}), 5.32, { rateStale: false })));
  });

  it("o texto vem dos arquivos de idioma (en e pt-BR têm as duas chaves)", () => {
    expect(en("checkout.whatsappMessage.exchangeRate", { rate: "5.32" })).toBe(LINE("5.32"));
    expect(en("checkout.whatsappMessage.exchangeRateApprox", { rate: "5.32" })).toBe(LINE("5.32", "approximate rate"));
    expect(pt("checkout.whatsappMessage.exchangeRate", { rate: "5.32" })).toBe("Cotação usada: US$ 1 = R$ 5.32 (cotação do dia)");
    expect(pt("checkout.whatsappMessage.exchangeRateApprox", { rate: "5.32" })).toBe("Cotação usada: US$ 1 = R$ 5.32 (cotação aproximada)");
  });
});

function normalizeSpaces(s: string): string {
  return s.replace(/[\u00a0\u202f]/g, " ");
}
