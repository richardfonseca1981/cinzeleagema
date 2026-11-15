import { beforeEach, describe, expect, it, vi } from "vitest";
import "./setup";
import { Prisma } from "@prisma/client";

// vi.hoisted: vi.mock() é içado para o topo do arquivo pelo vitest, antes de
// qualquer `const` — referenciar diretamente um `vi.fn()` declarado fora do
// factory daria ReferenceError. Os mocks ficam aqui para os testes de
// fetchReadOnly simularem o Prisma sem precisar de banco real (nem do
// Docker Desktop rodando).
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRawUnsafe: vi.fn(),
        product: { findMany: mocks.findMany },
        mercadoLivreAccount: { findFirst: mocks.findFirst },
      }),
  },
}));

import {
  parseArgs,
  buildSimulationCsvRows,
  buildSimulationCsvContent,
  fetchReadOnly,
  ACCOUNT_UNAVAILABLE_WARNING,
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

  it("anexa o aviso de conta ausente em toda linha quando informado", () => {
    const csv = buildSimulationCsvContent(["AME-001"], [baseProduct({ price: 1000 })], 0, ACCOUNT_UNAVAILABLE_WARNING);
    const dataLine = csv.slice(1).split("\n")[1];
    expect(dataLine).toContain(ACCOUNT_UNAVAILABLE_WARNING);
  });
});

describe("fetchReadOnly", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
    mocks.findFirst.mockReset();
    mocks.findMany.mockResolvedValue([]);
  });

  it("com --markup informado: nem consulta a tabela MercadoLivreAccount (funciona mesmo sem a migração da Fase 0 em produção)", async () => {
    const result = await fetchReadOnly(["AME-001"], 15);

    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(result).toEqual({ products: [], accountMarkupPct: null, accountUnavailable: false });
  });

  it("sem --markup, com conta conectada: usa o markupPct da conta", async () => {
    mocks.findFirst.mockResolvedValue({ markupPct: 12.5 });

    const result = await fetchReadOnly(["AME-001"], null);

    expect(mocks.findFirst).toHaveBeenCalledWith({ orderBy: { updatedAt: "desc" } });
    expect(result).toEqual({ products: [], accountMarkupPct: 12.5, accountUnavailable: false });
  });

  it("sem --markup e sem conta conectada (tabela existe, mas nenhuma linha): markup indisponível", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const result = await fetchReadOnly(["AME-001"], null);

    expect(result).toEqual({ products: [], accountMarkupPct: null, accountUnavailable: true });
  });

  it("sem --markup e com a tabela MercadoLivreAccount ausente (P2021, migração da Fase 0 não aplicada): cai para markup indisponível, nunca lança", async () => {
    mocks.findFirst.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("The table `public.MercadoLivreAccount` does not exist in the current database.", {
        code: "P2021",
        clientVersion: "5.22.0",
      })
    );

    const result = await fetchReadOnly(["AME-001"], null);

    expect(result).toEqual({ products: [], accountMarkupPct: null, accountUnavailable: true });
  });

  it("outro erro do Prisma (não P2021) continua sendo relançado, não é mascarado", async () => {
    mocks.findFirst.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Connection timed out", { code: "P2024", clientVersion: "5.22.0" })
    );

    await expect(fetchReadOnly(["AME-001"], null)).rejects.toThrow("Connection timed out");
  });
});
