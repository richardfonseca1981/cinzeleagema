import { describe, expect, it } from "vitest";
import "./setup";
import {
  parseArgs,
  buildSimulationCsvRows,
  buildSimulationCsvContent,
} from "../src/scripts/simulateMercadoLivre";
import { calculateMinimumMarkupForBreakeven, UNVERIFIED_DEFAULT_COMMISSION_PCT, UNVERIFIED_DEFAULT_FIXED_FEE_BRL, UNVERIFIED_DEFAULT_SHIPPING_COST_BRL } from "../src/lib/mercadoLivre/priceCalculator";

function baseProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    name: "Ametista Uruguaia",
    nameEn: null,
    sku: "AME-001",
    description: null,
    descriptionEn: null,
    identificationPt: null,
    identificationEn: null,
    identificationTreatment: null,
    price: 1200,
    active: true,
    trackStock: false,
    stockQty: null,
    weightGrams: 850,
    sizeCm: 23,
    images: [{ url: "https://cdn.test/a.jpg", position: 0, width: 1080, height: 1920 }],
    ...overrides,
  };
}

describe("parseArgs", () => {
  it("separa SKUs de --markup <valor>", () => {
    expect(parseArgs(["SKU1", "SKU2", "--markup", "15"])).toEqual({ skus: ["SKU1", "SKU2"], markupPctArg: 15 });
  });

  it("aceita --markup=<valor>", () => {
    expect(parseArgs(["SKU1", "--markup=20"])).toEqual({ skus: ["SKU1"], markupPctArg: 20 });
  });

  it("sem --markup, markupPctArg fica null", () => {
    expect(parseArgs(["SKU1", "SKU2", "SKU3"])).toEqual({ skus: ["SKU1", "SKU2", "SKU3"], markupPctArg: null });
  });

  it("funciona com --markup antes dos SKUs", () => {
    expect(parseArgs(["--markup", "10", "SKU1", "SKU2"])).toEqual({ skus: ["SKU1", "SKU2"], markupPctArg: 10 });
  });

  it("--markup com valor não numérico vira NaN (o caller valida e rejeita)", () => {
    const result = parseArgs(["SKU1", "--markup", "abc"]);
    expect(Number.isNaN(result.markupPctArg)).toBe(true);
  });
});

describe("buildSimulationCsvRows", () => {
  it("SKU não encontrado: linha com aviso 'sku_nao_encontrado', tudo mais vazio", () => {
    const [row] = buildSimulationCsvRows(["NAO-EXISTE"], [], 0);
    expect(row.sku).toBe("NAO-EXISTE");
    expect(row.titulo).toBe("");
    expect(row.preco_base).toBe("");
    expect(row.avisos).toBe("sku_nao_encontrado");
  });

  it("peça inapta (ex.: sem preço): sem título/preço, avisos com os motivos de inelegibilidade", () => {
    const product = baseProduct({ price: null });
    const [row] = buildSimulationCsvRows(["AME-001"], [product], 0);
    expect(row.titulo).toBe("");
    expect(row.preco_base).toBe("");
    expect(row.avisos).toContain("missing_price");
  });

  it("peça apta: título (variação A do titleGenerator), breakdown de preço completo e markup mínimo", () => {
    const product = baseProduct({ price: 1000 });
    const [row] = buildSimulationCsvRows(["AME-001"], [product], 10);

    expect(row.titulo).not.toBe("");
    expect(row.titulo).toContain("Ametista Uruguaia");

    expect(row.preco_base).toBe("1000.00");
    expect(row.acrescimo).toBe("100.00"); // 10% de 1000
    expect(row.preco_anuncio).toBe("1100.00");
    expect(row.comissao_estimativa_nao_verificada).toBe((1100 * (UNVERIFIED_DEFAULT_COMMISSION_PCT / 100)).toFixed(2));
    expect(row.tarifa_fixa_estimativa_nao_verificada).toBe(UNVERIFIED_DEFAULT_FIXED_FEE_BRL.toFixed(2));
    expect(row.frete_estimado_estimativa_nao_verificada).toBe(UNVERIFIED_DEFAULT_SHIPPING_COST_BRL.toFixed(2));

    const expectedMinMarkup = calculateMinimumMarkupForBreakeven(1000, {
      commissionPct: UNVERIFIED_DEFAULT_COMMISSION_PCT,
      fixedFeeBRL: UNVERIFIED_DEFAULT_FIXED_FEE_BRL,
      shippingCostBRL: UNVERIFIED_DEFAULT_SHIPPING_COST_BRL,
    });
    expect(row.markup_minimo_breakeven).toBe(expectedMinMarkup.toFixed(2));
  });

  it("sinaliza 'category_not_verified' (categoria placeholder da Fase 1A, via listingBuilder) em toda peça apta", () => {
    const product = baseProduct({ price: 1000 });
    const [row] = buildSimulationCsvRows(["AME-001"], [product], 0);
    expect(row.avisos).toContain("category_not_verified");
  });

  it("markup 0 (sem --markup, sem conta conectada): preço de anúncio igual ao preço base", () => {
    const product = baseProduct({ price: 500 });
    const [row] = buildSimulationCsvRows(["AME-001"], [product], 0);
    expect(row.preco_anuncio).toBe("500.00");
    expect(row.acrescimo).toBe("0.00");
  });

  it("reaproveita a desduplicação em lote do titleGenerator entre os SKUs pedidos (mesmo nome, peso diferencia)", () => {
    const productA = baseProduct({ id: "p1", sku: "A-1", sizeCm: 20, weightGrams: 500 });
    const productB = baseProduct({ id: "p2", sku: "A-2", sizeCm: 20, weightGrams: 900 });
    const rows = buildSimulationCsvRows(["A-1", "A-2"], [productA, productB], 0);
    expect(rows[0].titulo).not.toBe("");
    expect(rows[1].titulo).not.toBe("");
    expect(rows[0].titulo).not.toBe(rows[1].titulo);
  });

  it("preserva a ordem e repetição dos SKUs pedidos (não a ordem dos produtos encontrados)", () => {
    const product = baseProduct({ price: 1000 });
    const rows = buildSimulationCsvRows(["NAO-EXISTE", "AME-001"], [product], 0);
    expect(rows.map((r) => r.sku)).toEqual(["NAO-EXISTE", "AME-001"]);
  });
});

describe("buildSimulationCsvContent", () => {
  it("começa com o BOM UTF-8 (U+FEFF)", () => {
    const csv = buildSimulationCsvContent(["AME-001"], [baseProduct()], 0);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("inclui o cabeçalho com todas as colunas na ordem esperada, marcando as taxas como estimativa não verificada", () => {
    const csv = buildSimulationCsvContent(["AME-001"], [baseProduct()], 0);
    const firstLine = csv.slice(1).split("\n")[0];
    expect(firstLine).toBe(
      "sku,titulo,preco_base,acrescimo,preco_anuncio,comissao_estimativa_nao_verificada,tarifa_fixa_estimativa_nao_verificada,frete_estimado_estimativa_nao_verificada,liquido_estimado,markup_minimo_breakeven,avisos"
    );
  });

  it("escapa valores com vírgula", () => {
    const csv = buildSimulationCsvContent(["NAO, EXISTE"], [], 0);
    expect(csv).toContain('"NAO, EXISTE"');
  });
});
