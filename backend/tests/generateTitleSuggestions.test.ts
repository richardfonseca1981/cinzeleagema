import { describe, expect, it } from "vitest";
import "./setup";
import {
  buildTitleSuggestionCsvRows,
  buildTitleSuggestionCsvContent,
} from "../src/scripts/generateTitleSuggestions";
import type { TitleGenerationInput } from "../src/lib/mercadoLivre/titleGenerator";

function baseProduct(overrides: Partial<TitleGenerationInput> = {}): TitleGenerationInput {
  return {
    id: "prod-1",
    name: "Ametista Uruguaia",
    nameEn: null,
    sku: "AME-001",
    description: null,
    descriptionEn: null,
    identificationPt: null,
    identificationEn: null,
    price: 1200,
    active: true,
    trackStock: false,
    stockQty: null,
    weightGrams: 850,
    sizeCm: 23,
    images: [{ width: 1080, height: 1920 }],
    ...overrides,
  };
}

describe("buildTitleSuggestionCsvRows", () => {
  it("preenche sku, nome atual, títulos e tamanhos para peça apta", () => {
    const [row] = buildTitleSuggestionCsvRows([baseProduct()]);
    expect(row.sku).toBe("AME-001");
    expect(row.nome_atual).toBe("Ametista Uruguaia");
    expect(row.titulo_a).not.toBe("");
    expect(row.titulo_b).not.toBe("");
    expect(Number(row.titulo_a_tamanho)).toBe(row.titulo_a.length);
    expect(Number(row.titulo_b_tamanho)).toBe(row.titulo_b.length);
  });

  it("peça inapta fica com títulos/tamanhos vazios (nunca '0' ou 'null') e aviso explicando o motivo", () => {
    const [row] = buildTitleSuggestionCsvRows([baseProduct({ price: null })]);
    expect(row.titulo_a).toBe("");
    expect(row.titulo_a_tamanho).toBe("");
    expect(row.titulo_b).toBe("");
    expect(row.titulo_b_tamanho).toBe("");
    expect(row.avisos).toContain("ineligible");
  });

  it("avisos vêm dos códigos do gerador, separados por '; '", () => {
    const [row] = buildTitleSuggestionCsvRows([
      baseProduct({ name: "Peca Decorativa Artesanal Sem Material Reconhecido" }),
    ]);
    expect(row.avisos).toBe("variants_equal");
  });
});

describe("buildTitleSuggestionCsvContent", () => {
  it("começa com o BOM UTF-8 (U+FEFF)", () => {
    const csv = buildTitleSuggestionCsvContent([baseProduct()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("inclui o cabeçalho com todas as colunas na ordem esperada", () => {
    const csv = buildTitleSuggestionCsvContent([baseProduct()]);
    const firstLine = csv.slice(1).split("\n")[0];
    expect(firstLine).toBe("sku,nome_atual,titulo_a,titulo_a_tamanho,titulo_b,titulo_b_tamanho,avisos");
  });

  it("escapa valores com vírgula", () => {
    const csv = buildTitleSuggestionCsvContent([baseProduct({ sku: "AME,001" })]);
    expect(csv).toContain('"AME,001"');
  });
});
