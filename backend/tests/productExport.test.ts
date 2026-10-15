import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";

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

  it("generates a file with only headers when there are no products", async () => {
    const res = await getXlsxBuffer();
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(res.headers["content-disposition"]).toMatch(/pecas-\d{4}-\d{2}-\d{2}\.xlsx/);

    const sheet = await loadWorkbook(res.body as Buffer);
    expect(sheet.rowCount).toBe(1);
    const headerRow = sheet.getRow(1).values as unknown[];
    expect(headerRow.slice(1)).toEqual(EXPECTED_HEADERS);
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
    expect(sheet.rowCount).toBe(4); // header + 3 produtos

    function rowFor(id: string) {
      for (let i = 2; i <= sheet.rowCount; i++) {
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
    expect(incompleteRow.getCell(9).value).toBe(0); // peso 0 (valor cru do banco)
    expect(incompleteRow.getCell(11).value).toBe("Não");
    expect(incompleteRow.getCell(12).value).toBeNull(); // sem controle de estoque
    expect(incompleteRow.getCell(13).value).toBe("Não"); // inativo aparece no export

    const injectionRow = rowFor(injection.id);
    expect(injectionRow.getCell(3).value).toBe("'=CMD('calc')");
    expect(injectionRow.getCell(4).value).toBe("'+SUM(A1:A2)");
    expect(injectionRow.getCell(2).value).toBe("'-1000");
  });
});
