import { describe, expect, it } from "vitest";
import { buildCategoryExportCsv } from "../src/lib/categoryExportCsv";
import { parseCsv } from "../src/lib/csv";

describe("buildCategoryExportCsv", () => {
  it("começa com BOM UTF-8 (abre certo no Excel pt-BR)", () => {
    const csv = buildCategoryExportCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("cabeçalho e linhas com os dados reais; ausência vira célula vazia", () => {
    const csv = buildCategoryExportCsv([
      { id: "p1", sku: "SKU-1", name: "Ametista Bruta", categoryName: "Pedras Brutas", subcategoryName: "Pedras Brutas Peça" },
      { id: "p2", sku: null, name: null, categoryName: null, subcategoryName: null },
    ]);

    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(["id", "sku", "nome", "categoria", "subcategoria"]);
    expect(rows[1]).toEqual(["p1", "SKU-1", "Ametista Bruta", "Pedras Brutas", "Pedras Brutas Peça"]);
    expect(rows[2]).toEqual(["p2", "", "", "", ""]);
  });
});
