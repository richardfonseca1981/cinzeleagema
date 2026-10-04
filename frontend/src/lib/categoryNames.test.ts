import { describe, expect, it } from "vitest";
import i18next from "i18next";
import en from "../locales/en.json";
import ptBR from "../locales/pt-BR.json";
import { localizeCategoryName } from "./format";

// Nomes reais do cliente (desenho vigente: 6 categorias, BIG com 3 subcategorias,
// "Formas" como CATEGORIA de nível 1 sem subcategorias). O menu do catálogo traduz
// pelo NOME, com o mesmo mapa para categorias e subcategorias.
const CATEGORY_NAMES = ["Pedras Brutas", "Pedras Polidas", "Big", "Formas", "Homedecor", "Acessorios"];
const SUBCATEGORY_NAMES = [
  "Pedras Brutas Peça",
  "Capelas de Ametista",
  "Capelas de Citrino",
  "Pedras Exclusivas",
  "Pedras Roladas",
  "Pedras Polidas Exclusivas",
  "Ametistas",
  "Calcitas",
  "Citrinos",
];

async function makeT(lng: "en" | "pt-BR") {
  const i18n = i18next.createInstance();
  await i18n.init({ lng, resources: { en: { translation: en }, "pt-BR": { translation: ptBR } }, fallbackLng: "pt-BR", interpolation: { escapeValue: false } });
  return i18n.t.bind(i18n);
}

describe("nomes de categoria no menu do catálogo", () => {
  it("'Formas' (agora categoria de nível 1) aparece como 'Shapes' em inglês", async () => {
    expect(localizeCategoryName(await makeT("en"), "Formas")).toBe("Shapes");
  });

  it("em português continua 'Formas'", async () => {
    expect(localizeCategoryName(await makeT("pt-BR"), "Formas")).toBe("Formas");
  });

  it("todas as categorias e subcategorias do desenho têm tradução em inglês", () => {
    const map = en.categoryNames as Record<string, string>;
    for (const name of [...CATEGORY_NAMES, ...SUBCATEGORY_NAMES]) {
      expect(map[name], `falta categoryNames["${name}"] em en.json`).toBeTruthy();
    }
  });

  it("um nome sem tradução cai no próprio nome em português (nunca mostra a chave)", async () => {
    expect(localizeCategoryName(await makeT("en"), "Categoria Nova Sem Tradução")).toBe("Categoria Nova Sem Tradução");
  });
});
