import { buildCsv } from "./csv";

// CSV de backup da categorização atual — usado tanto para o Felipe conferir
// manualmente (por isso o BOM: abre certo no Excel pt-BR, diferente da
// convenção de lib/catalog/missingDataCsv.ts, que não precisa disso) quanto
// como ENTRADA do script restore:categories (ver restoreCategories.ts) —
// mudar as colunas aqui exige atualizar o parser de lá também.
const BOM = "﻿";

export interface CategoryExportRow {
  id: string;
  sku: string | null;
  name: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
}

export const CATEGORY_EXPORT_HEADER = ["id", "sku", "nome", "categoria", "subcategoria"];

export function buildCategoryExportCsv(rows: readonly CategoryExportRow[]): string {
  const body = rows.map((row) => [row.id, row.sku ?? "", row.name ?? "", row.categoryName ?? "", row.subcategoryName ?? ""]);
  return BOM + buildCsv([CATEGORY_EXPORT_HEADER, ...body]);
}
