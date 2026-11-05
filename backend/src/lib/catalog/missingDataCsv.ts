import type { CatalogMissingDataEntry } from "./generateCatalogPdf";

// Escapa um campo para CSV (RFC 4180): envolve em aspas se tiver vírgula,
// aspas ou quebra de linha; aspas internas viram duplas. Mesma convenção do
// CSV de avisos já existente (ver scripts/generateSampleCatalog.ts).
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// CSV de peças com descrição/peso/tamanho ausentes (ver AJUSTES
// A4/CATÁLOGO item 4) — para o admin completar o cadastro. Colunas pedidas:
// Ref, nome, descrição ausente, peso ausente, tamanho ausente ("Sim"/vazio).
export function buildMissingDataCsv(entries: readonly CatalogMissingDataEntry[]): string {
  const header = ["Ref", "Nome", "Descrição ausente", "Peso ausente", "Tamanho ausente"];
  const rows = entries.map((entry) => [
    entry.ref ?? "",
    entry.title,
    entry.missingDescription ? "Sim" : "",
    entry.missingWeight ? "Sim" : "",
    entry.missingSize ? "Sim" : "",
  ]);
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}
