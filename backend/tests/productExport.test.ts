import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";
import { formatSaoPauloDateTime } from "../src/routes/productExport.routes";

const app = createApp();
const token = generateTestToken();

const EXPORT_PATH = "/api/admin/products/export";

const EXPECTED_HEADERS = [
  "ID",
  "SKU",
  "Nome",
  "Descrição",
  "Nome (EN)",
  "Descrição (EN)",
  "Categoria",
  "Preço de venda (R$)",
  "Peso (g)",
  "Tamanho (cm)",
  "Controla estoque",
  "Quantidade em estoque",
  "Ativo",
  "Fotos (URLs)",
  "Criado em",
  "Atualizado em",
];

// supertest não tem um parser nativo para xlsx — captura o corpo bruto como
// Buffer (mesma técnica usada para qualquer download binário) para depois
// abrir com o próprio exceljs e conferir o conteúdo real da planilha.
function getXlsxBuffer() {
  return request(app)
    .get(EXPORT_PATH)
    .set("Authorization", `Bearer ${token}`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    });
}

async function loadWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.getWorksheet("Peças")!;
}

// A tabela agora vem depois do banner (logo + título + data/hora + total) —
// localiza a linha do cabeçalho pelo conteúdo ("ID" na 1ª coluna) em vez de
// assumir que é a linha 1.
function findHeaderRowNumber(sheet: ExcelJS.Worksheet): number {
  for (let r = 1; r <= sheet.rowCount; r++) {
    if (sheet.getRow(r).getCell(1).value === "ID") return r;
  }
  throw new Error("linha de cabeçalho não encontrada");
}

// Varre as primeiras linhas (bloco do topo) atrás de um texto com o prefixo
// dado, sem depender do número exato da linha.
function findCellTextStartingWith(sheet: ExcelJS.Worksheet, prefix: string): string | undefined {
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      const value = row.getCell(c).value;
      if (typeof value === "string" && value.startsWith(prefix)) return value;
    }
  }
  return undefined;
}

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("GET /api/admin/products/export", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("rejects without an auth token", async () => {
    const res = await request(app).get(EXPORT_PATH);
    expect(res.status).toBe(401);
  });

  it("rejects with an invalid token", async () => {
    const res = await request(app).get(EXPORT_PATH).set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("generates a file with the banner and table header even with no products", async () => {
    const res = await getXlsxBuffer();
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(res.headers["content-disposition"]).toMatch(/pecas-\d{4}-\d{2}-\d{2}\.xlsx/);

    const sheet = await loadWorkbook(res.body as Buffer);
    const headerRowNumber = findHeaderRowNumber(sheet);
    expect(sheet.rowCount).toBe(headerRowNumber); // nenhuma linha de dado abaixo do cabeçalho

    const headerRow = sheet.getRow(headerRowNumber).values as unknown[];
    expect(headerRow.slice(1)).toEqual(EXPECTED_HEADERS);

    expect(findCellTextStartingWith(sheet, "Relatório de Peças")).toBeDefined();
    expect(findCellTextStartingWith(sheet, "Gerado em:")).toBeDefined();
    expect(findCellTextStartingWith(sheet, "Total de peças: 0 (ativas: 0, inativas: 0)")).toBeDefined();
  });

  it("embute o logo da marca na planilha", async () => {
    const res = await getXlsxBuffer();
    const sheet = await loadWorkbook(res.body as Buffer);
    expect(sheet.getImages().length).toBeGreaterThanOrEqual(1);
  });

  it('mostra "Gerado em:" convertido para America/Sao_Paulo (não o horário UTC do servidor)', async () => {
    // 19:02 UTC em outubro (horário de verão não se aplica mais no Brasil
    // desde 2019) é 16:02 em São Paulo (UTC-3) — por isso o teste falharia se
    // o código usasse o horário cru do servidor em vez de converter o fuso.
    const fixedNow = new Date("2026-10-15T19:02:00.000Z");
    expect(formatSaoPauloDateTime(fixedNow)).toBe("15/10/2026 16:02");
  });

  it("includes active and inactive products, with all fields and relations, and protects against formula injection", async () => {
    const category = await prisma.category.create({ data: { name: "Pedras Brutas", slug: "pedras-brutas" } });
    const subcategory = await prisma.subcategory.create({
      data: { name: "Pedras Brutas Peça", slug: "pedras-brutas-peca", categoryId: category.id },
    });

    const complete = await prisma.product.create({
      data: {
        name: "Esmeralda Colombiana",
        slug: "esmeralda-colombiana",
        description: "Peça lapidada",
        sku: "ESM-001",
        price: 8500,
        weightGrams: 12.5,
        sizeCm: 2.3,
        trackStock: true,
        stockQty: 3,
        active: true,
        categoryId: category.id,
        subcategoryId: subcategory.id,
        images: { create: [{ url: "https://cdn.example.com/a.jpg", key: "a.jpg", position: 0 }] },
      },
    });

    const incomplete = await prisma.product.create({
      data: {
        name: null,
        slug: "peca-sem-nome",
        description: null,
        sku: null,
        price: null,
        weightGrams: 0,
        sizeCm: 0,
        trackStock: false,
        stockQty: null,
        active: false,
        categoryId: null,
        subcategoryId: null,
      },
    });

    const injection = await prisma.product.create({
      data: {
        name: "=CMD('calc')",
        slug: "peca-injecao",
        description: "+SUM(A1:A2)",
        sku: "-1000",
        price: 10,
        weightGrams: 1,
        sizeCm: 1,
        trackStock: false,
        active: true,
        categoryId: null,
      },
    });

    const res = await getXlsxBuffer();
    expect(res.status).toBe(200);

    const sheet = await loadWorkbook(res.body as Buffer);
    const headerRowNumber = findHeaderRowNumber(sheet);
    expect(sheet.rowCount).toBe(headerRowNumber + 3); // header + 3 produtos

    expect(findCellTextStartingWith(sheet, "Total de peças: 3 (ativas: 2, inativas: 1)")).toBeDefined();

    function rowFor(id: string) {
      for (let i = headerRowNumber + 1; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        if (row.getCell(1).value === id) return row;
      }
      throw new Error(`row not found for ${id}`);
    }

    const completeRow = rowFor(complete.id);
    expect(completeRow.getCell(2).value).toBe("ESM-001"); // SKU
    expect(completeRow.getCell(3).value).toBe("Esmeralda Colombiana"); // Nome
    expect(completeRow.getCell(4).value).toBe("Peça lapidada"); // Descrição
    expect(completeRow.getCell(7).value).toBe("Pedras Brutas, Pedras Brutas Peça"); // Categoria
    expect(completeRow.getCell(8).value).toBe(8500); // Preço
    expect(completeRow.getCell(8).numFmt).toBe('"R$" #,##0.00'); // formato monetário
    expect(completeRow.getCell(9).value).toBe(12.5); // Peso
    expect(completeRow.getCell(10).value).toBe(2.3); // Tamanho
    expect(completeRow.getCell(11).value).toBe("Sim"); // Controla estoque
    expect(completeRow.getCell(12).value).toBe(3); // Quantidade em estoque
    expect(completeRow.getCell(13).value).toBe("Sim"); // Ativo
    expect(completeRow.getCell(14).value).toBe("https://cdn.example.com/a.jpg"); // Fotos

    const incompleteRow = rowFor(incomplete.id);
    expect(incompleteRow.getCell(2).value).toBeNull(); // SKU ausente
    expect(incompleteRow.getCell(3).value).toBeNull(); // Nome ausente
    expect(incompleteRow.getCell(7).value).toBeNull(); // sem categoria
    expect(incompleteRow.getCell(8).value).toBeNull(); // sem preço
    expect(incompleteRow.getCell(9).value).toBeNull(); // peso 0 -> vazio (não informado)
    expect(incompleteRow.getCell(10).value).toBeNull(); // tamanho 0 -> vazio (não informado)
    expect(incompleteRow.getCell(11).value).toBe("Não");
    expect(incompleteRow.getCell(12).value).toBeNull(); // sem controle de estoque
    expect(incompleteRow.getCell(13).value).toBe("Não"); // inativo aparece no export

    const injectionRow = rowFor(injection.id);
    expect(injectionRow.getCell(3).value).toBe("'=CMD('calc')");
    expect(injectionRow.getCell(4).value).toBe("'+SUM(A1:A2)");
    expect(injectionRow.getCell(2).value).toBe("'-1000");
  });

  it("liga autofiltro e congela painéis logo abaixo do cabeçalho da tabela", async () => {
    await prisma.product.create({
      data: { name: "Peça", slug: "peca-autofiltro", weightGrams: 1, sizeCm: 1, active: true },
    });

    const res = await getXlsxBuffer();
    const sheet = await loadWorkbook(res.body as Buffer);
    const headerRowNumber = findHeaderRowNumber(sheet);

    expect(sheet.autoFilter).toBeTruthy();
    expect(String(sheet.autoFilter)).toMatch(new RegExp(`^A${headerRowNumber}:`));

    expect(sheet.views).toHaveLength(1);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: headerRowNumber });
  });
});
