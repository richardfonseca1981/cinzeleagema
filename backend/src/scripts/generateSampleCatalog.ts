import path from "path";
import fs from "fs/promises";
import { prisma } from "../lib/prisma";
import { generateCatalogPdf, type GenerateCatalogPdfResult } from "../lib/catalog/generateCatalogPdf";
import { DEFAULT_ORDER_BY } from "../lib/productSort";

// Gera um PDF de amostra do catálogo (PT e EN) com peças REAIS do banco
// local — só leitura, não altera peça nem foto nenhuma.
//
// Uso (a partir de backend/):
//   npm run catalog:sample --                      -> ~10 peças (PT+EN), na ordem do admin
//   npm run catalog:sample -- --all                 -> todas as peças ativas com foto (PT+EN)
//   npm run catalog:sample -- --all --lang=pt        -> só PT
//   npm run catalog:sample -- --limit=20
//
// Salva em backend/tmp/ (fora do git — ver .gitignore), imprime tempo total e
// tamanho de cada arquivo gerado, e grava backend/tmp/catalogo-avisos.csv
// (Ref, Nome, Tipo do aviso) a partir da última geração em PT desta execução.

const DEFAULT_SAMPLE_SIZE = 10;
const OUTPUT_DIR = path.resolve(__dirname, "../../tmp");
const WARNINGS_CSV_PATH = path.join(OUTPUT_DIR, "catalogo-avisos.csv");

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function resolveSampleProductIds(limit: number): Promise<string[]> {
  const products = await prisma.product.findMany({
    where: { active: true, images: { some: {} } },
    orderBy: DEFAULT_ORDER_BY,
    take: limit,
    select: { id: true },
  });
  return products.map((p) => p.id);
}

async function generateAndSave(
  label: string,
  filename: string,
  options: { productIds?: string[]; language: "pt" | "en" }
): Promise<GenerateCatalogPdfResult> {
  const start = Date.now();
  const result = await generateCatalogPdf(options);
  const elapsedMs = Date.now() - start;

  const outputPath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(outputPath, result.buffer);

  console.log(`\n[${label}]`);
  console.log(`  arquivo: ${outputPath}`);
  console.log(`  tamanho: ${formatBytes(result.buffer.length)}`);
  console.log(`  páginas: ${result.pageCount}`);
  console.log(`  tempo: ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`  divisores de categoria: ${result.categoryDividersIncluded ? "sim" : "não"}`);
  if (result.skipped.length > 0) {
    console.log(`  peças puladas (${result.skipped.length}):`);
    for (const s of result.skipped) console.log(`    - ${s.id}: ${s.reason}`);
  } else {
    console.log("  peças puladas: nenhuma");
  }
  if (result.warnings.length > 0) {
    console.log(`  avisos (${result.warnings.length}):`);
    for (const w of result.warnings) console.log(`    - ${w.ref ?? w.id} (${w.title}): ${w.reason}`);
  } else {
    console.log("  avisos: nenhum");
  }

  return result;
}

// Escapa um campo para CSV (RFC 4180): envolve em aspas se tiver vírgula,
// aspas ou quebra de linha; aspas internas viram duplas.
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function writeWarningsCsv(result: GenerateCatalogPdfResult): Promise<void> {
  const header = ["Ref", "Nome", "Tipo do aviso"];
  const rows = result.warnings.map((w) => [w.ref ?? "", w.title, w.reason]);
  const csv = [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
  await fs.writeFile(WARNINGS_CSV_PATH, csv, "utf-8");
  console.log(`\nAvisos salvos em ${WARNINGS_CSV_PATH} (${result.warnings.length} linha(s)).`);
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : DEFAULT_SAMPLE_SIZE;
  const langArg = args.find((a) => a.startsWith("--lang="))?.split("=")[1];
  const languages: Array<"pt" | "en"> = langArg === "pt" ? ["pt"] : langArg === "en" ? ["en"] : ["pt", "en"];

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const productIds = all ? undefined : await resolveSampleProductIds(limit);
  if (!all && productIds!.length === 0) {
    console.error("Nenhuma peça ativa com foto encontrada no banco local — nada a gerar.");
    process.exit(1);
  }

  const suffix = all ? "completo" : "amostra";
  console.log(all ? "Gerando catálogo com TODAS as peças ativas..." : `Gerando catálogo de amostra com ${productIds!.length} peça(s)...`);

  let lastPtResult: GenerateCatalogPdfResult | null = null;
  for (const language of languages) {
    const result = await generateAndSave(language.toUpperCase(), `catalogo-${suffix}-${language}.pdf`, { productIds, language });
    if (language === "pt") lastPtResult = result;
  }

  if (lastPtResult) await writeWarningsCsv(lastPtResult);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
