import { beforeAll, describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import type { CartItem } from "../../types";
import { buildWhatsAppMessage } from "./whatsappMessage";
import { destinationFor, resolveShippingSummary, type UsableShippingSummary } from "./summary";
import { isRateApproximate, type RateSource } from "../exchangeRateQuality";
import type { StoredShipping } from "./storage";
import type { ShippingOption, ShippingUnavailableReason } from "./types";
import { makeT } from "./testHelpers";

const NOW = 1_800_000_000_000;
const items: CartItem[] = [
  { productId: "p1", name: "Esmeralda", nameEn: "Emerald", unitPrice: 100, imageUrl: null, weightGrams: 2, sizeCm: 1, quantity: 2 },
  { productId: "p2", name: "Quartzo", nameEn: null, unitPrice: 50, imageUrl: null, weightGrams: 0, sizeCm: 0, quantity: 1 },
]; // subtotal R$ 250,00

const pac: ShippingOption = { id: "pac", carrier: "Correios", service: "PAC", priceBRL: 45, deliveryDaysMin: 5, deliveryDaysMax: 8, kind: "quoted" };
const noDays: ShippingOption = { ...pac, id: "nd", deliveryDaysMin: null, deliveryDaysMax: null };
// Exterior: o cliente cadastra só o nome do serviço (carrier = service)
const abroad: ShippingOption = { id: "intl-1", carrier: "DHL Express", service: "DHL Express", priceBRL: 210, deliveryDaysMin: 7, deliveryDaysMax: 15, kind: "quoted" };

function stored(over: Partial<StoredShipping> & { options?: ShippingOption[]; mode?: "domestic" | "international"; notice?: "taxes_not_included" | null; unavailable?: ShippingUnavailableReason | null } = {}): StoredShipping {
  const { options = [pac], mode = "domestic", notice = null, unavailable = null, ...rest } = over;
  return {
    version: 2, country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP",
    quote: {
      result: {
        destination: { country: "BR", postalCode: "01001000", city: "São Paulo", state: "SP" },
        mode, options: unavailable ? [] : options, requiresConfirmation: false, notice,
        unavailable: unavailable ? { reason: unavailable } : null,
      },
      signature: "sig", savedAt: NOW,
    },
    selection: unavailable ? null : options[0]?.id ?? null,
    arrangeChoice: null,
    ...rest,
  };
}
const intl = (over: Parameters<typeof stored>[0] = {}) =>
  stored({ country: "US", postalCode: "10001", city: null, state: null, mode: "international", notice: "taxes_not_included", ...over });
// Falha técnica em que o comprador escolheu "Fechar o pedido com frete a combinar"
const technical = (over: Partial<StoredShipping> = {}) =>
  stored({ quote: null, selection: null, arrangeChoice: { signature: "sig", cause: "network", chosenAt: NOW }, ...over });

function usable(s: StoredShipping, sig = "sig"): UsableShippingSummary {
  const summary = resolveShippingSummary(s, sig, NOW + 1000);
  if (summary.kind === "none") throw new Error("sem frete utilizável neste cenário");
  return summary;
}

let pt: TFunction;
let en: TFunction;
beforeAll(async () => {
  pt = await makeT("pt-BR");
  en = await makeT("en");
});

function build(lang: "pt-BR" | "en", s: StoredShipping, rate: number | null = null) {
  const summary = usable(s);
  // toLocaleString usa espaço não separável após "R$": normaliza para comparar.
  return normalizeSpaces(
    buildWhatsAppMessage({
      t: lang === "en" ? en : pt, lang, exchangeRate: rate, items, summary,
      destination: destinationFor(s, summary), customerName: "Maria", customerPhone: "+5511999990000",
    })
  );
}

const NO_ESTIMATE = /estimad|estimate|prévia|preview|\ba confirmar\b|to be confirmed/i;

describe("mensagem do WhatsApp — português (valores em R$)", () => {
  it("Brasil cotado: destino, serviço, preço e prazo, e o total — sem 'a confirmar'", () => {
    const msg = build("pt-BR", stored({}));
    expect(msg.split("\n")).toEqual([
      "Olá! Gostaria de fazer um pedido:",
      "• 2x Esmeralda (2g · 1cm) — R$ 200,00",
      "• 1x Quartzo — R$ 50,00",
      "Subtotal: R$ 250,00",
      "Destino: Brasil, CEP 01001-000 — São Paulo, SP",
      "Frete: Correios — PAC, R$ 45,00, 5 a 8 dias",
      "Total (produtos + frete): R$ 295,00",
      "Nome: Maria",
      "Telefone: +5511999990000",
    ]);
    expect(msg).not.toMatch(NO_ESTIMATE);
    expect(msg).not.toMatch(/Impostos/);
  });

  it("frete cotado sem prazo: omite a vírgula e o prazo", () => {
    const msg = build("pt-BR", stored({ options: [noDays] }));
    expect(msg).toContain("Frete: Correios — PAC, R$ 45,00\n");
    expect(msg).not.toMatch(/R\$ 45,00,/);
  });

  it("exterior cotado: serviço da tabela, preço, prazo, impostos de importação não incluídos, sem 'a confirmar'", () => {
    const msg = build("pt-BR", intl({ options: [abroad] }));
    expect(msg).toContain("Destino: Estados Unidos, código postal 10001");
    expect(msg).toContain("Frete: DHL Express, R$ 210,00, 7 a 15 dias\n");
    expect(msg).toContain("Impostos de importação não incluídos");
    expect(msg).toContain("Total (produtos + frete): R$ 460,00");
    expect(msg).not.toMatch(NO_ESTIMATE);
  });

  it.each([
    ["over_limits", "peça ou pedido grande demais para a embalagem padrão"],
    ["incomplete_product_data", "falta peso ou medida de uma peça"],
  ] as const)("a combinar por %s (Brasil): motivo curto, total sem frete, sem impostos", (reason, short) => {
    const msg = build("pt-BR", stored({ unavailable: reason }));
    expect(msg).toContain(`Frete: a combinar pelo atendimento (${short})`);
    expect(msg).toContain("Total (sem frete): R$ 250,00");
    expect(msg).toContain("Destino: Brasil, CEP 01001-000 — São Paulo, SP");
    expect(msg).not.toMatch(/Impostos|Total estimado/);
  });

  it("país sem tarifa (no_rates_configured): a combinar + impostos de importação não incluídos", () => {
    const msg = build("pt-BR", intl({ unavailable: "no_rates_configured" }));
    expect(msg).toContain("Frete: a combinar pelo atendimento (sem tabela de frete para este país)");
    expect(msg).toContain("Impostos de importação não incluídos");
    expect(msg).toContain("Total (sem frete): R$ 250,00");
    expect(msg).toContain("Destino: Estados Unidos, código postal 10001");
  });

  it("over_limits no exterior também leva o aviso de impostos", () => {
    expect(build("pt-BR", intl({ unavailable: "over_limits" }))).toContain("Impostos de importação não incluídos");
  });

  it("a combinar escolhido pelo comprador depois de uma falha técnica", () => {
    const msg = build("pt-BR", technical());
    expect(msg).toContain("Frete: a combinar pelo atendimento (cálculo automático indisponível no momento)");
    expect(msg).toContain("Total (sem frete): R$ 250,00");
    expect(msg).toContain("Destino: Brasil, CEP 01001-000 — São Paulo, SP");
  });

  it("exterior sem código postal: só o país", () => {
    const msg = build("pt-BR", intl({ country: "PT", postalCode: "", unavailable: "no_rates_configured" }));
    expect(msg).toContain("Destino: Portugal\n");
  });

  it("nenhuma variação usa 'Total estimado' nem 'estimativa'", () => {
    for (const s of [stored({}), intl({ options: [abroad] }), stored({ unavailable: "over_limits" }), technical()]) {
      expect(build("pt-BR", s)).not.toMatch(/Total estimado|estimativa|estimado/i);
    }
  });
});

describe("mensagem do WhatsApp — inglês (valores em dólar pela cotação do dia)", () => {
  const RATE = 5;

  it("Brasil cotado: tudo em dólar, destino e prazo em inglês", () => {
    const msg = build("en", stored({}), RATE);
    expect(msg.split("\n")).toEqual([
      "Hi! I'd like to place an order:",
      "• 2x Emerald (2g · 1cm) — $40.00",
      "• 1x Quartzo — $10.00",
      "Subtotal: $50.00",
      "Destination: Brazil, postal code 01001-000 — São Paulo, SP",
      "Shipping: Correios — PAC, $9.00, 5 to 8 days",
      "Total (products + shipping): $59.00",
      "Name: Maria",
      "Phone: +5511999990000",
      "",
      "Exchange rate used: US$ 1 = R$ 5.00 (rate of the day)",
    ]);
    expect(msg).not.toMatch(NO_ESTIMATE);
  });

  it("os valores em dólar da mensagem somam (subtotal + frete = total)", () => {
    const msg = build("en", stored({}), 5.37);
    const money = (label: RegExp) => Number(msg.match(label)![1].replace(/[$,]/g, ""));
    const subtotal = money(/Subtotal: (\$[\d,.]+)/);
    const shipping = money(/Correios — PAC, (\$[\d,.]+)/);
    const total = money(/Total \(products \+ shipping\): (\$[\d,.]+)/);
    expect(Math.round((subtotal + shipping) * 100)).toBe(Math.round(total * 100));
  });

  it("exterior cotado em inglês: serviço, preço, prazo e aviso de impostos", () => {
    const msg = build("en", intl({ options: [abroad] }), RATE);
    expect(msg).toContain("Destination: United States, postal code 10001");
    expect(msg).toContain("Shipping: DHL Express, $42.00, 7 to 15 days\n");
    expect(msg).toContain("Import taxes not included");
    expect(msg).toContain("Total (products + shipping): $92.00");
    expect(msg).not.toMatch(NO_ESTIMATE);
  });

  it.each([
    ["over_limits", "piece or order too large for the standard packaging"],
    ["incomplete_product_data", "weight or size of a piece is missing"],
  ] as const)("a combinar por %s em inglês", (reason, short) => {
    const msg = build("en", stored({ unavailable: reason }), RATE);
    expect(msg).toContain(`Shipping: to be arranged with our team (${short})`);
    expect(msg).toContain("Total (excluding shipping): $50.00");
    expect(msg).not.toMatch(/Import taxes|Estimated total/);
  });

  it("país sem tarifa em inglês: a combinar + impostos", () => {
    const msg = build("en", intl({ unavailable: "no_rates_configured" }), RATE);
    expect(msg).toContain("Shipping: to be arranged with our team (no shipping table for this country)");
    expect(msg).toContain("Import taxes not included");
    expect(msg).toContain("Total (excluding shipping): $50.00");
  });

  it("escolha após falha técnica, em inglês", () => {
    expect(build("en", technical(), RATE)).toContain("Shipping: to be arranged with our team (automatic calculation unavailable at the moment)");
  });

  it("sem cotação do dólar disponível, cai para Real (mesma regra do resto do site)", () => {
    const msg = build("en", stored({}), null);
    expect(msg).toMatch(/Subtotal: R\$\s?250\.00/);
  });
});

// Constrói a mensagem já normalizada, com opções extras (rateApproximate).
function buildWith(lang: "pt-BR" | "en", s: StoredShipping, rate: number | null, extra: { rateApproximate?: boolean } = {}) {
  const summary = usable(s);
  return normalizeSpaces(
    buildWhatsAppMessage({
      t: lang === "en" ? en : pt, lang, exchangeRate: rate, items, summary,
      destination: destinationFor(s, summary), customerName: "Maria", customerPhone: "+5511999990000", ...extra,
    })
  );
}

describe("linha informativa da cotação (só em inglês, só com conversão aplicada)", () => {
  const LINE = (rate: string, kind = "rate of the day") => `Exchange rate used: US$ 1 = R$ ${rate} (${kind})`;

  it("inglês com conversão: a linha é a ÚLTIMA, separada por uma linha em branco", () => {
    const lines = buildWith("en", stored({}), 5.32).split("\n");
    expect(lines.at(-1)).toBe(LINE("5.32"));
    expect(lines.at(-2)).toBe("");
    expect(lines.at(-3)).toBe("Phone: +5511999990000");
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
    expect(msg.split("\n").at(-1)).toBe("Telefone: +5511999990000");
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
    const msg = buildWith("en", stored({}), 5.32, { rateApproximate: true });
    expect(msg.split("\n").at(-1)).toBe(LINE("5.32", "approximate rate"));
    expect(msg).not.toContain("rate of the day");
  });

  it("cotação atual (padrão): '(rate of the day)'", () => {
    expect(buildWith("en", stored({}), 5.32, { rateApproximate: false }).split("\n").at(-1)).toBe(LINE("5.32"));
    expect(buildWith("en", stored({}), 5.32).split("\n").at(-1)).toBe(LINE("5.32"));
  });

  it("desatualizada MAS sem conversão aplicada: sem linha nenhuma", () => {
    expect(buildWith("en", stored({}), null, { rateApproximate: true })).not.toMatch(/Exchange rate|approximate/);
  });

  it("o número da linha é EXATAMENTE a cotação que converteu os valores (5.37)", () => {
    const msg = buildWith("en", stored({}), 5.37);
    // R$ 200,00 / 5,37 = 37.24 ; R$ 50,00 / 5,37 = 9.31 ; subtotal R$ 250,00 / 5,37 = 46.55 ; frete R$ 45,00 / 5,37 = 8.38
    expect(msg).toContain("• 2x Emerald (2g · 1cm) — $37.24");
    expect(msg).toContain("• 1x Quartzo — $9.31");
    expect(msg).toContain("Subtotal: $46.55");
    expect(msg).toContain("Correios — PAC, $8.38");
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

  it("vale para qualquer mensagem em inglês: cotado, a combinar (cada motivo), internacional e escolha após falha", () => {
    const cases: Array<[string, StoredShipping]> = [
      ["cotado", stored({})],
      ["cotado no exterior", intl({ options: [abroad] })],
      ["over_limits", stored({ unavailable: "over_limits" })],
      ["país sem tarifa", intl({ unavailable: "no_rates_configured" })],
      ["produto incompleto", stored({ unavailable: "incomplete_product_data" })],
      ["a combinar após falha técnica", technical()],
    ];
    for (const [label, s] of cases) {
      const lines = buildWith("en", s, 5.32).split("\n");
      expect(lines.at(-1), label).toBe(LINE("5.32"));
      expect(lines.at(-2), label).toBe("");
    }
  });

  it("a linha é só informativa: os valores da mensagem são idênticos com ou sem 'rateApproximate'", () => {
    const strip = (m: string) => m.split("\n").slice(0, -2).join("\n");
    expect(strip(buildWith("en", stored({}), 5.32, { rateApproximate: true }))).toBe(strip(buildWith("en", stored({}), 5.32, { rateApproximate: false })));
  });

  describe("da resposta de /api/exchange-rate até a linha final (origem da cotação)", () => {
    const NOW_MS = Date.parse("2026-10-05T12:00:00.000Z");
    const FRESH = "2026-10-05T11:30:00.000Z";
    const OLD = "2026-10-01T12:00:00.000Z";
    const endWith = (info: { updatedAt: string | null; source?: RateSource | null }) =>
      buildWith("en", stored({}), 5.32, { rateApproximate: isRateApproximate(info, NOW_MS) }).split("\n").at(-1);

    it.each([
      ["live recente", { updatedAt: FRESH, source: "live" as const }, "rate of the day"],
      ["stale", { updatedAt: OLD, source: "stale" as const }, "approximate rate"],
      ["fallback (updatedAt = agora)", { updatedAt: "2026-10-05T12:00:00.000Z", source: "fallback" as const }, "approximate rate"],
      ["velha só pelo updatedAt", { updatedAt: OLD, source: null }, "approximate rate"],
      ["sem source e recente (backend antigo)", { updatedAt: FRESH, source: null }, "rate of the day"],
    ])("%s → (%s)", (_label, info, text) => {
      expect(endWith(info)).toBe(`Exchange rate used: US$ 1 = R$ 5.32 (${text})`);
    });

    it("o número e o resto da mensagem são os mesmos nas duas variações — só muda o texto entre parênteses", () => {
      const a = buildWith("en", stored({}), 5.32, { rateApproximate: false });
      const b = buildWith("en", stored({}), 5.32, { rateApproximate: true });
      expect(a.replace("(rate of the day)", "(approximate rate)")).toBe(b);
    });
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
