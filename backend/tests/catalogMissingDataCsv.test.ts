import { describe, expect, it } from "vitest";
import { buildMissingDataCsv } from "../src/lib/catalog/missingDataCsv";
import type { CatalogMissingDataEntry } from "../src/lib/catalog/generateCatalogPdf";

function entry(overrides: Partial<CatalogMissingDataEntry> = {}): CatalogMissingDataEntry {
  return {
    id: "p1",
    ref: "SKU-1",
    title: "Ágata Azul",
    missingDescription: false,
    missingWeight: false,
    missingSize: false,
    ...overrides,
  };
}

describe("buildMissingDataCsv", () => {
  it("gera só o cabeçalho quando não há peças com dados faltando", () => {
    const csv = buildMissingDataCsv([]);
    expect(csv).toBe("Ref,Nome,Descrição ausente,Peso ausente,Tamanho ausente\r\n");
  });

  it("marca 'Sim' só nas colunas do que está faltando", () => {
    const csv = buildMissingDataCsv([entry({ missingDescription: true, missingWeight: true })]);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe("SKU-1,Ágata Azul,Sim,Sim,");
  });

  it("Ref ausente vira campo vazio, não 'null'", () => {
    const csv = buildMissingDataCsv([entry({ ref: null, missingSize: true })]);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe(",Ágata Azul,,,Sim");
  });

  it("escapa nome com vírgula entre aspas (RFC 4180)", () => {
    const csv = buildMissingDataCsv([entry({ title: "Ágata, Azul", missingDescription: true })]);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe('SKU-1,"Ágata, Azul",Sim,,');
  });
});
