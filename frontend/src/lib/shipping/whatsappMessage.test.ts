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

function normalizeSpaces(s: string): string {
  return s.replace(/[\u00a0\u202f]/g, " ");
}
