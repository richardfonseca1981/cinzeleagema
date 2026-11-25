// Escrita e leitura de CSV (RFC 4180) compartilhadas entre o export de
// categorização (categoryExportCsv.ts) e o script restore:categories — as
// duas pontas do mesmo arquivo, por isso o parser só precisa entender
// exatamente o que `csvField`/`buildCsv` abaixo escrevem (aspas quando o
// campo tem vírgula/aspas/quebra de linha, aspas internas dobradas,
// terminador "\r\n", mesma convenção já usada em lib/catalog/missingDataCsv.ts).

export function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

// Parser mínimo, só para o que este projeto escreve (sem suporte a BOM — o
// chamador decide se adiciona um na escrita; aqui ele é removido antes de
// interpretar as linhas, se presente). Linha vazia no fim do arquivo (depois
// do \r\n final) é descartada.
export function parseCsv(text: string): string[][] {
  const content = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // ignorado — tratado junto do "\n" seguinte
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
