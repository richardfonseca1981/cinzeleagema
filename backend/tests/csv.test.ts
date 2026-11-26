import { describe, expect, it } from "vitest";
import { buildCsv, csvField, parseCsv } from "../src/lib/csv";

describe("csvField", () => {
  it("campo simples não é envolvido em aspas", () => {
    expect(csvField("Pedras Brutas")).toBe("Pedras Brutas");
  });

  it("campo com vírgula, aspas ou quebra de linha é envolvido em aspas, com aspas internas dobradas", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('a"b')).toBe('"a""b"');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });
});

describe("buildCsv / parseCsv — round-trip", () => {
  it("volta exatamente ao conteúdo original para campos simples", () => {
    const rows = [
      ["id", "sku", "nome", "categoria", "subcategoria"],
      ["p1", "SKU-1", "Ametista Bruta", "Pedras Brutas", "Pedras Brutas Peça"],
      ["p2", "", "Sem SKU", "", ""],
    ];
    const csv = buildCsv(rows);
    expect(parseCsv(csv)).toEqual(rows);
  });

  it("round-trip com campos contendo vírgula, aspas e quebra de linha", () => {
    const rows = [
      ["id", "nome"],
      ["p1", 'Peça "Única", Rara'],
      ["p2", "Linha 1\nLinha 2"],
    ];
    const csv = buildCsv(rows);
    expect(parseCsv(csv)).toEqual(rows);
  });

  it("remove o BOM antes de interpretar as linhas", () => {
    const withBom = "﻿id,nome\r\np1,Ametista\r\n";
    expect(parseCsv(withBom)).toEqual([
      ["id", "nome"],
      ["p1", "Ametista"],
    ]);
  });
});
