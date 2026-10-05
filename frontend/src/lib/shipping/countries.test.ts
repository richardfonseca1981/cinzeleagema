import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, countryName, listCountries } from "./countries";

describe("lista de países (ISO 3166-1 alpha-2)", () => {
  it("249 códigos únicos, todos com 2 letras maiúsculas", () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
    for (const code of COUNTRY_CODES) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  it.each(["pt-BR", "en"])("(%s) todo código tem nome de verdade no idioma (não só o código — pega erro de digitação)", (lang) => {
    for (const code of COUNTRY_CODES) expect(countryName(code, lang), code).not.toBe(code);
  });

  it("Brasil é o primeiro nos dois idiomas, com o nome localizado", () => {
    expect(listCountries("pt-BR")[0]).toEqual({ code: "BR", name: "Brasil" });
    expect(listCountries("en")[0]).toEqual({ code: "BR", name: "Brazil" });
  });

  it.each(["pt-BR", "en"])("(%s) o resto vem em ordem alfabética no idioma ativo", (lang) => {
    const collator = new Intl.Collator(lang === "en" ? "en" : "pt-BR");
    const names = listCountries(lang).slice(1).map((c) => c.name);
    expect(names).toEqual([...names].sort(collator.compare));
    expect(names).toHaveLength(248);
  });

  it("a ordem muda com o idioma (Alemanha/Germany, Estados Unidos/United States)", () => {
    const pt = listCountries("pt-BR").map((c) => c.code);
    const en = listCountries("en").map((c) => c.code);
    expect(pt).not.toEqual(en);
    expect(countryName("DE", "pt-BR")).toBe("Alemanha");
    expect(countryName("DE", "en")).toBe("Germany");
    expect(countryName("US", "pt-BR")).toBe("Estados Unidos");
  });

  it("nomes com acento ordenam corretamente em português (Áustria entre Austrália e Azerbaijão)", () => {
    const names = listCountries("pt-BR").map((c) => c.name);
    expect(names.indexOf("Austrália")).toBeLessThan(names.indexOf("Áustria"));
    expect(names.indexOf("Áustria")).toBeLessThan(names.indexOf("Azerbaijão"));
  });
});
