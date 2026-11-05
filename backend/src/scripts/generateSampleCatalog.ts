import path from "path";
import fs from "fs/promises";
import { prisma } from "../lib/prisma";
import { generateCatalogPdf, type GenerateCatalogPdfResult } from "../lib/catalog/generateCatalogPdf";
import { buildMissingDataCsv } from "../lib/catalog/missingDataCsv";
import type { CatalogPhotoQuality } from "../lib/catalog/photoLayer";
import { DEFAULT_ORDER_BY } from "../lib/productSort";

// Gera um PDF de amostra do catálogo (PT e EN) com peças REAIS do banco
// local — só leitura, não altera peça nem foto nenhuma.
//
// Uso (a partir de backend/):
//   npm run catalog:sample --                      -> ~10 peças (PT+EN), na ordem do admin
//   npm run catalog:sample -- --all                 -> todas as peças ativas com foto (PT+EN)
//   npm run catalog:sample -- --all --lang=pt        -> só PT
//   npm run catalog:sample -- --limit=20
//   npm run catalog:sample -- --all --lang=pt --quality=light  -> modo leve (WhatsApp/e-mail)
//
// Salva em backend/tmp/ (fora do git — ver .gitignore), imprime tempo total e
// tamanho de cada arquivo gerado, e grava (a partir da última geração em PT
// desta execução) backend/tmp/catalogo-avisos.csv (Ref, Nome, Tipo do aviso)
// e backend/tmp/catalogo-faltando-dados.csv (Ref, Nome, descrição/peso/
// tamanho ausentes — ver AJUSTES A4/CATÁLOGO item 4).

const DEFAULT_SAMPLE_SIZE = 10;
const OUTPUT_DIR = path.resolve(__dirname, "../../tmp");
const WARNINGS_CSV_PATH = path.join(OUTPUT_DIR, "catalogo-avisos.csv");
const MISSING_DATA_CSV_PATH = path.join(OUTPUT_DIR, "catalogo-faltando-dados.csv");

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
  options: { productIds?: string[]; language: "pt" | "en"; quality?: CatalogPhotoQuality }
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
  const missingDescription = result.missingData.filter((m) => m.missingDescription).length;
  const missingWeight = result.missingData.filter((m) => m.missingWeight).length;
  const missingSize = result.missingData.filter((m) => m.missingSize).length;
  console.log(
    `  dados faltando: ${result.missingData.length} peça(s) — sem descrição: ${missingDescription}, sem peso: ${missingWeight}, sem tamanho: ${missingSize}`
  );

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

  await fs.writeFile(MISSING_DATA_CSV_PATH, buildMissingDataCsv(result.missingData), "utf-8");
  console.log(`Dados faltando salvos em ${MISSING_DATA_CSV_PATH} (${result.missingData.length} linha(s)).`);
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : DEFAULT_SAMPLE_SIZE;
  const langArg = args.find((a) => a.startsWith("--lang="))?.split("=")[1];
  const languages: Array<"pt" | "en"> = langArg === "pt" ? ["pt"] : langArg === "en" ? ["en"] : ["pt", "en"];
  const qualityArg = args.find((a) => a.startsWith("--quality="))?.split("=")[1];
  const quality: CatalogPhotoQuality = qualityArg === "light" ? "light" : "standard";

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const productIds = all ? undefined : await resolveSampleProductIds(limit);
  if (!all && productIds!.length === 0) {
    console.error("Nenhuma peça ativa com foto encontrada no banco local — nada a gerar.");
    process.exit(1);
  }

  const suffix = (all ? "completo" : "amostra") + (quality === "light" ? "-leve" : "");
  console.log(
    (all ? "Gerando catálogo com TODAS as peças ativas" : `Gerando catálogo de amostra com ${productIds!.length} peça(s)`) +
      (quality === "light" ? " (modo leve)..." : "...")
  );

  let lastPtResult: GenerateCatalogPdfResult | null = null;
  for (const language of languages) {
    const result = await generateAndSave(language.toUpperCase(), `catalogo-${suffix}-${language}.pdf`, { productIds, language, quality });
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
