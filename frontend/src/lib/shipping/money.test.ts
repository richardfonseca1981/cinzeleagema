import { describe, expect, it } from "vitest";
import { computeOrderTotals, formatCents, toDisplayCents, usesDollars } from "./money";

describe("conversão e formatação", () => {
  it("português: Real em centavos; inglês com cotação: dólar; inglês sem cotação: cai para Real", () => {
    expect(toDisplayCents(10.5, "pt-BR", 5)).toBe(1050);
    expect(toDisplayCents(10, "en", 5)).toBe(200);
    expect(toDisplayCents(10, "en", null)).toBe(1000);
    expect(toDisplayCents(10, "en", 0)).toBe(1000);
    expect(usesDollars("en", 5.4)).toBe(true);
    expect(usesDollars("pt-BR", 5.4)).toBe(false);
  });

  it("formata como o resto do site", () => {
    expect(formatCents(1050, "pt-BR", null)).toMatch(/R\$\s?10,50/);
    expect(formatCents(1050, "en", 5)).toBe("$10.50");
    expect(formatCents(1050, "en", null)).toMatch(/R\$\s?10\.50/); // sem cotação: Real, separador en-US
  });

  it("arredonda para o centavo mais próximo (sem erro de ponto flutuante clássico)", () => {
    expect(toDisplayCents(1.005, "pt-BR", null)).toBe(101);
    expect(toDisplayCents(0.1 + 0.2, "pt-BR", null)).toBe(30);
  });
});

describe("os números exibidos SOMAM (subtotal + frete = total, ao centavo)", () => {
  // Com esta cotação, converter o TOTAL (R$ 25,00 → US$ 4,66) dá 1 centavo a
  // mais que somar as parcelas já arredondadas (US$ 4,65 + ...): exatamente o
  // que a tela não pode mostrar.
  const RATE = 5.37;
  const lines = [10];
  const shipping = 15;

  it("o método ingênuo (converter o total) difere por centavos das parcelas — por isso somamos as parcelas", () => {
    const naiveTotal = toDisplayCents(lines[0] + shipping, "en", RATE);
    const parts = toDisplayCents(lines[0], "en", RATE) + toDisplayCents(shipping, "en", RATE);
    expect(naiveTotal).toBe(466);
    expect(parts).toBe(465);
  });

  it("em dólar: total = subtotal + frete exatamente", () => {
    const t = computeOrderTotals(lines, shipping, "en", RATE);
    expect(t.subtotalCents).toBe(t.lineCents[0]);
    expect(t.totalCents).toBe(465); // e não 466
    expect(t.totalCents).toBe(t.subtotalCents + (t.shippingCents as number));
    expect(t.shippingCents).toBe(toDisplayCents(shipping, "en", RATE));
  });

  it("o texto exibido também soma (lendo os valores formatados de volta)", () => {
    const t = computeOrderTotals(lines, shipping, "en", RATE);
    const read = (cents: number) => Math.round(Number(formatCents(cents, "en", RATE).replace(/[$,]/g, "")) * 100);
    expect(read(t.subtotalCents) + read(t.shippingCents as number)).toBe(read(t.totalCents));
  });

  it("as linhas do carrinho somam o subtotal", () => {
    const t = computeOrderTotals([10.01, 20.02, 30.03], null, "en", 5.5);
    expect(t.lineCents.reduce((a, b) => a + b, 0)).toBe(t.subtotalCents);
  });

  it("sem frete (a combinar): total = subtotal", () => {
    const t = computeOrderTotals(lines, null, "pt-BR", null);
    expect(t.shippingCents).toBeNull();
    expect(t.totalCents).toBe(t.subtotalCents);
  });

  it("propriedade: para centenas de combinações de valores e cotações, total = soma das parcelas", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let i = 0; i < 500; i++) {
      const rate = 3 + rand() * 4;
      const ls = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => Math.round(rand() * 100000) / 100);
      const ship = Math.round(rand() * 20000) / 100;
      for (const lang of ["pt-BR", "en"]) {
        const t = computeOrderTotals(ls, ship, lang, rate);
        expect(t.totalCents).toBe(t.lineCents.reduce((a, b) => a + b, 0) + toDisplayCents(ship, lang, rate));
      }
    }
  });
});
