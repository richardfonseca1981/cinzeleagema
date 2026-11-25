import fs from "fs";
import type { PrismaClient } from "@prisma/client";
import { parseCsv } from "../lib/csv";
import { CATEGORY_EXPORT_HEADER } from "../lib/categoryExportCsv";
import { applyBulkCategoryItems, validateBulkCategoryItems, type BulkCategoryItemInput } from "../lib/bulkCategory";
import { recordAdminAction } from "../lib/adminActionLog";

// Restaura categoria/subcategoria a partir do CSV de backup (GET
// /api/admin/products/category-export.csv) — mesmo padrão de
// scripts/promoteFormasToCategory.ts: SIMULAÇÃO por padrão (só mostra o
// plano, nunca grava), `--apply` executa de verdade, numa transação só.
//
// Uso (a partir de backend/):
//   SIMULAÇÃO (padrão):
//     npm run restore:categories -- caminho/para/categorizacao.csv
//   APLICAR:
//     npm run restore:categories -- caminho/para/categorizacao.csv --apply
//
// O CSV identifica categoria/subcategoria pelo NOME (coluna legível para o
// Felipe conferir no Excel) — resolvido contra o estado ATUAL do banco no
// momento da restauração, não contra ids gravados no arquivo (o export não
// inclui id de categoria/subcategoria, só os nomes). `Category.name` NÃO é
// único no banco (só `slug` é `@unique`) — nome duplicado é tratado como
// ERRO na linha (nunca escolhe "qualquer uma" das categorias com esse nome).
// Por isso: só use esta restauração logo depois do backup, antes de
// qualquer criação/renomeação de categoria que possa gerar ambiguidade.

export class RestoreCategoriesError extends Error {}

export interface Options {
  apply: boolean;
  filePath: string;
}

export function parseArgs(argv: string[]): Options {
  let apply = false;
  let filePath: string | undefined;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg.startsWith("--")) throw new RestoreCategoriesError(`Argumento desconhecido: ${arg}`);
    else if (filePath) throw new RestoreCategoriesError("Informe só UM arquivo CSV");
    else filePath = arg;
  }
  if (!filePath) {
    throw new RestoreCategoriesError(
      "Informe o caminho do CSV exportado (GET /api/admin/products/category-export.csv). Uso: restore:categories <arquivo.csv> [--apply]"
    );
  }
  return { apply, filePath };
}

export interface RowError {
  line: number; // linha no arquivo (1 = cabeçalho); -1 quando o erro só aparece depois (checagem contra o banco)
  productId: string;
  reason: string;
}

export interface RestorePlan {
  totalRows: number;
  items: BulkCategoryItemInput[]; // só as linhas que vão de fato mudar algo
  noopCount: number; // linhas válidas, mas já iguais ao estado atual
  errors: RowError[];
}

export interface Deps {
  prisma: PrismaClient;
  log(line: string): void;
}

export async function buildRestorePlan(deps: Deps, csvContent: string): Promise<RestorePlan> {
  const rows = parseCsv(csvContent).filter((r) => !(r.length === 1 && r[0] === ""));
  const [header, ...dataRows] = rows;
  if (!header || header.join(",") !== CATEGORY_EXPORT_HEADER.join(",")) {
    throw new RestoreCategoriesError(
      `Cabeçalho inesperado (esperado "${CATEGORY_EXPORT_HEADER.join(",")}"): ${header?.join(",") ?? "(arquivo vazio)"}`
    );
  }

  const [categories, subcategories] = await Promise.all([
    deps.prisma.category.findMany({ select: { id: true, name: true } }),
    deps.prisma.subcategory.findMany({ select: { id: true, name: true, categoryId: true } }),
  ]);

  function resolveCategory(name: string): { id: string | null; error?: string } {
    if (!name) return { id: null };
    const matches = categories.filter((c) => c.name === name);
    if (matches.length === 0) return { id: null, error: `categoria "${name}" não existe mais` };
    if (matches.length > 1) return { id: null, error: `nome de categoria "${name}" é ambíguo (${matches.length} categorias com esse nome)` };
    return { id: matches[0].id };
  }

  function resolveSubcategory(name: string, categoryId: string | null): { id: string | null; error?: string } {
    if (!name) return { id: null };
    if (!categoryId) return { id: null, error: `subcategoria "${name}" informada sem categoria resolvida` };
    const matches = subcategories.filter((s) => s.name === name && s.categoryId === categoryId);
    if (matches.length === 0) return { id: null, error: `subcategoria "${name}" não existe (ou não pertence à categoria resolvida)` };
    if (matches.length > 1) return { id: null, error: `nome de subcategoria "${name}" é ambíguo dentro da categoria` };
    return { id: matches[0].id };
  }

  const resolved: BulkCategoryItemInput[] = [];
  const errors: RowError[] = [];

  dataRows.forEach((cols, index) => {
    const line = index + 2; // +1 cabeçalho, +1 base-1
    const [id, , , categoryName, subcategoryName] = cols;
    if (!id) return; // linha em branco

    const cat = resolveCategory(categoryName ?? "");
    if (cat.error) {
      errors.push({ line, productId: id, reason: cat.error });
      return;
    }
    const sub = resolveSubcategory(subcategoryName ?? "", cat.id);
    if (sub.error) {
      errors.push({ line, productId: id, reason: sub.error });
      return;
    }
    resolved.push({ id, categoryId: cat.id, subcategoryId: sub.id });
  });

  // Checagem extra (deveria ser redundante, já que os nomes acabaram de ser
  // resolvidos contra o banco) — rede de segurança contra corrida entre a
  // leitura dos nomes e esta validação.
  const validationErrors = await validateBulkCategoryItems(deps.prisma, resolved);
  const invalidIds = new Set(validationErrors.map((e) => e.id));
  for (const e of validationErrors) errors.push({ line: -1, productId: e.id, reason: e.reason });

  const existing = await deps.prisma.product.findMany({
    where: { id: { in: resolved.filter((i) => !invalidIds.has(i.id)).map((i) => i.id) } },
    select: { id: true, categoryId: true, subcategoryId: true },
  });
  const existingById = new Map(existing.map((p) => [p.id, p]));

  let noopCount = 0;
  const items: BulkCategoryItemInput[] = [];
  for (const item of resolved) {
    if (invalidIds.has(item.id)) continue;
    const current = existingById.get(item.id);
    if (!current) {
      errors.push({ line: -1, productId: item.id, reason: "peça não existe mais no banco" });
      continue;
    }
    if (current.categoryId === item.categoryId && current.subcategoryId === item.subcategoryId) {
      noopCount++;
      continue;
    }
    items.push(item);
  }

  return { totalRows: dataRows.length, items, noopCount, errors };
}

const MAX_ERRORS_SHOWN = 20;

export async function runRestore(options: Options, deps: Deps, csvContent: string): Promise<void> {
  const plan = await buildRestorePlan(deps, csvContent);

  deps.log(`Linhas no CSV: ${plan.totalRows}`);
  deps.log(`Já corretas (sem mudança): ${plan.noopCount}`);
  deps.log(`Serão alteradas: ${plan.items.length}`);
  deps.log(`Erros (linha ignorada): ${plan.errors.length}`);
  for (const err of plan.errors.slice(0, MAX_ERRORS_SHOWN)) {
    deps.log(`  - linha ${err.line} (peça ${err.productId}): ${err.reason}`);
  }
  if (plan.errors.length > MAX_ERRORS_SHOWN) deps.log(`  ... e mais ${plan.errors.length - MAX_ERRORS_SHOWN} erro(s)`);

  if (!options.apply) {
    deps.log("\nSIMULAÇÃO — nada foi gravado. Use --apply para executar.");
    return;
  }

  if (plan.items.length === 0) {
    deps.log("\nNada a aplicar (todas as linhas válidas já estão com esse estado, ou não há linhas válidas).");
    return;
  }

  const result = await deps.prisma.$transaction(async (tx) => {
    const applied = await applyBulkCategoryItems(tx, plan.items);
    // Mesmo nome de ação do endpoint de lote (bulk_category_move) — a
    // restauração vira desfazível pelo POST /bulk-category/undo normal,
    // sem precisar de um mecanismo de desfazer próprio.
    await recordAdminAction(
      tx,
      { id: "script:restore-categories", username: "restore:categories (script)" },
      "bulk_category_move",
      { before: applied.before, after: applied.after, source: "restore:categories" }
    );
    return applied;
  });

  deps.log(`\nAPLICADO: ${result.before.length} peça(s) atualizada(s), ${result.skippedIds.length} ignorada(s) (id não encontrado na hora de aplicar).`);
}

export async function main(argv: string[]): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  let csvContent: string;
  try {
    csvContent = fs.readFileSync(options.filePath, "utf8");
  } catch (err) {
    console.error(`Erro ao ler "${options.filePath}": ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const { prisma } = await import("../lib/prisma");
  const deps: Deps = { prisma, log: (line) => console.log(line) };

  try {
    await runRestore(options, deps, csvContent);
    return 0;
  } catch (err) {
    console.error(`\nERRO: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
