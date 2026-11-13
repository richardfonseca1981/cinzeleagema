import { describe, expect, it } from "vitest";
import "./setup";
import { buildAuditRows, buildCsvContent, type AuditProductRow } from "../src/scripts/auditMercadoLivre";

function baseProduct(overrides: Partial<AuditProductRow> = {}): AuditProductRow {
  return {
    id: "cm3x9f8s9f0000t3rggia1b2c3",
    name: "Esmeralda Colombiana 2.3ct",
    nameEn: null,
    sku: "ESM-001",
    description: "Peça lapidada.",
    descriptionEn: null,
    identificationPt: null,
    identificationEn: null,
    price: 8500,
    active: true,
    trackStock: false,
    stockQty: null,
    weightGrams: 0.46,
    sizeCm: 0.9,
    images: [{ width: 1080, height: 1920 }],
    category: { name: "Pedras Brutas" },
    subcategory: { name: "Formas" },
    ...overrides,
  };
}

describe("buildAuditRows", () => {
  it("preenche preço, peso, tamanho, categoria/subcategoria e contagem de fotos", () => {
    const [row] = buildAuditRows([baseProduct()]);
    expect(row.preco).toBe("8500.00");
    expect(row.weightGrams).toBe("0.46");
    expect(row.sizeCm).toBe("0.90");
    expect(row.categoria).toBe("Pedras Brutas");
    expect(row.subcategoria).toBe("Formas");
    expect(row.quantidade_de_fotos).toBe("1");
    expect(row.fotos_dimensao_desconhecida).toBe("0");
  });

  it("monta a url pública com o mesmo cálculo de slug do sitemap (nome + sufixo do id)", () => {
    const [row] = buildAuditRows([baseProduct()]);
    expect(row.url_publica).toBe("https://www.cinzeleagema.com.br/catalogo/esmeralda-colombiana-2-3ct-a1b2c3");
  });

  it("peça sem nome usa o fallback 'peca' no slug da url pública", () => {
    const [row] = buildAuditRows([baseProduct({ name: null })]);
    expect(row.url_publica).toBe("https://www.cinzeleagema.com.br/catalogo/peca-a1b2c3");
  });

  it("preco/categoria/subcategoria ficam vazios (nunca '0.00' ou 'null') quando ausentes", () => {
    const [row] = buildAuditRows([baseProduct({ price: null, category: null, subcategory: null })]);
    expect(row.preco).toBe("");
    expect(row.categoria).toBe("");
    expect(row.subcategoria).toBe("");
  });

  it("conta fotos com dimensão desconhecida separadamente da contagem total", () => {
    const [row] = buildAuditRows([
      baseProduct({
        images: [
          { width: 1080, height: 1920 },
          { width: null, height: null },
        ],
      }),
    ]);
    expect(row.quantidade_de_fotos).toBe("2");
    expect(row.fotos_dimensao_desconhecida).toBe("1");
  });

  it("motivos e avisos vêm dos códigos de blockers/warnings do validador, separados por '; '", () => {
    const [row] = buildAuditRows([baseProduct({ price: null, images: [] })]);
    expect(row.apto).toBe("nao");
    expect(row.motivos).toBe("missing_price; no_photos");
    expect(row.avisos).toBe("");
  });
});

describe("buildCsvContent", () => {
  it("começa com o BOM UTF-8 (U+FEFF), para o Excel abrir acentos corretamente", () => {
    const csv = buildCsvContent([baseProduct()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("inclui o cabeçalho com todas as colunas na ordem esperada", () => {
    const csv = buildCsvContent([baseProduct()]);
    const firstLine = csv.slice(1).split("\n")[0];
    expect(firstLine).toBe(
      "id,sku,nome,apto,preco,weightGrams,sizeCm,categoria,subcategoria,quantidade_de_fotos,fotos_dimensao_desconhecida,url_publica,motivos,avisos"
    );
  });

  it("escapa valores com vírgula (ex.: motivos concatenados nunca usam vírgula como separador interno)", () => {
    const csv = buildCsvContent([baseProduct({ name: 'Peça "Rara", Edição Única' })]);
    expect(csv).toContain('"Peça ""Rara"", Edição Única"');
  });
});
