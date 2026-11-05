import path from "path";
import fs from "fs/promises";
import { prisma } from "../lib/prisma";
import { getObject } from "../lib/r2";
import { proposeIdentification } from "../lib/productIdentification";
import { generateCatalogPdf, type GenerateCatalogPdfResult } from "../lib/catalog/generateCatalogPdf";
import { analyzeBackgroundTrim, type CatalogPhotoFit } from "../lib/catalog/photoLayer";
import type { CatalogLanguage } from "../lib/catalog/content";

// Gera amostras do catálogo com PEÇAS REAIS (dados + fotos reais do R2) —
// SOMENTE LEITURA: nenhuma peça/foto/identificação é alterada no banco.
// Precisa do DATABASE_URL apontado para o banco de amostra na sessão do
// comando (ver instruções do pedido — nunca produção), ex.:
//   DATABASE_URL="postgresql://postgres:sample@127.0.0.1:5437/cinzel_catalogo_amostra?schema=public" \
//     npx tsx src/scripts/generateRealCatalogSamples.ts
//
// Este script é um wrapper FINO sobre generateCatalogPdf — ver AJUSTES
// revisão final item 1: uma versão anterior deste script reimplementava a
// montagem da página numa cópia paralela do pipeline (pra poder sobrepor a
// identificação por IA em memória) e essa cópia divergiu silenciosamente da
// lógica real (esqueceu de aplicar a regra de preço provisório, mostrando
// "R$ 1,00" em vez de "Consulte o valor"). Agora usa
// generateCatalogPdf({ productIdentificationOverrides }) — a MESMA função
// usada em produção, então preço/avisos/dados ausentes nunca podem
// divergir de novo por definição (não há segunda implementação pra
// divergir).
//
// A peça escolhida para "identificação por IA" (ver AI_IDENTIFICATION_SKU)
// chama a IDENTIFICAÇÃO DE CATÁLOGO REAL (mesma rota usada pelo admin,
// Claude Haiku 4.5 com visão sobre a foto real) para obter uma proposta —
// mas a proposta NUNCA é salva (não chama saveIdentification); ela só é
// passada em memória via productIdentificationOverrides.

const OUTPUT_DIR = path.resolve(__dirname, "../../tmp");

// SKUs escolhidos após investigar o banco de amostra (107 peças ativas,
// todas já com peso/tamanho/descrição preenchidos e fotos 9:16 — ver
// relatório): 39 tem o nome mais longo real (55 caracteres); 21 é uma foto
// vertical real em alta resolução (3762x6688, 9:16); 32 é a peça escolhida
// para a identificação por IA real; 110 é uma peça com nome/preço
// placeholder de importação em lote (demonstra os avisos já existentes);
// as demais são peças normais para diversidade de categoria.
const SAMPLE_SKUS = ["39", "21", "32", "110", "102", "98", "37", "72", "45", "40"];
const AI_IDENTIFICATION_SKU = "32";
// 6 peças pedidas explicitamente para a comparação contain x cover x trim.
const COMPARISON_SKUS = ["39", "21", "32", "110", "111", "102"];

async function resolveProducts(skus: string[]): Promise<{ id: string; sku: string | null; imageKey: string }[]> {
  const products = await prisma.product.findMany({
    where: { sku: { in: skus } },
    select: { id: true, sku: true, images: { orderBy: { position: "asc" }, take: 1, select: { key: true } } },
  });
  const bySku = new Map(products.map((p) => [p.sku, p]));
  return skus.map((sku) => {
    const p = bySku.get(sku);
    if (!p) throw new Error(`SKU ${sku} não encontrado no banco de amostra`);
    if (p.images.length === 0) throw new Error(`SKU ${sku} não tem foto`);
    return { id: p.id, sku: p.sku, imageKey: p.images[0].key };
  });
}

// Gera a identificação REAL (Claude com visão sobre a foto real) para a
// peça escolhida — NÃO salva (sem chamada a saveIdentification). Devolve o
// mapa pronto para productIdentificationOverrides (vazio se a peça não
// estiver no conjunto pedido).
async function buildAiIdentificationOverride(
  products: { id: string; sku: string | null }[]
): Promise<Record<string, { identificationPt: string | null; identificationEn: string | null }>> {
  const target = products.find((p) => p.sku === AI_IDENTIFICATION_SKU);
  if (!target) return {};

  console.log(`\nGerando identificação por IA REAL (não salva no banco) para SKU ${target.sku}...`);
  const proposal = await proposeIdentification(target.id);
  console.log(`  identificationPt: "${proposal.identificationPt}"`);
  console.log(`  identificationEn: "${proposal.identificationEn}"`);
  console.log(`  confidence: ${proposal.confidence}  treatment: ${proposal.treatment}`);
  if (proposal.note) console.log(`  note: "${proposal.note}"`);

  return { [target.id]: { identificationPt: proposal.identificationPt, identificationEn: proposal.identificationEn } };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function generateAndSave(
  label: string,
  filename: string,
  productIds: string[],
  language: CatalogLanguage,
  photoFit: CatalogPhotoFit,
  productIdentificationOverrides: Record<string, { identificationPt: string | null; identificationEn: string | null }>
): Promise<GenerateCatalogPdfResult> {
  const start = Date.now();
  const result = await generateCatalogPdf({ productIds, language, photoFit, productIdentificationOverrides });
  const elapsedMs = Date.now() - start;

  const outputPath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(outputPath, result.buffer);

  console.log(`\n[${label}]`);
  console.log(`  arquivo: ${outputPath}`);
  console.log(`  tamanho: ${formatBytes(result.buffer.length)}`);
  console.log(`  páginas: ${result.pageCount} (A4 595.28x841.89pt cada)`);
  console.log(`  tempo: ${(elapsedMs / 1000).toFixed(1)}s`);
  if (result.skipped.length > 0) {
    console.log(`  peças puladas (${result.skipped.length}):`);
    for (const s of result.skipped) console.log(`    - ${s.id}: ${s.reason}`);
  }
  if (result.warnings.length > 0) {
    console.log(`  avisos (${result.warnings.length}):`);
    for (const w of result.warnings) console.log(`    - ${w.ref ?? w.id} (${w.title}): ${w.reason}`);
  } else {
    console.log("  avisos: nenhum");
  }
  return result;
}

// Relatório de corte (trim) por peça — SÓ para este relatório; chama
// analyzeBackgroundTrim (função pura, sem efeito colateral) direto sobre a
// foto real de cada peça da comparação, sem duplicar nada da montagem da
// página (ver cabeçalho do arquivo — isso é exatamente o tipo de
// duplicação que causou o bug de preço antes).
async function printTrimReport(products: { id: string; sku: string | null; imageKey: string }[]): Promise<void> {
  console.log("\n=== RELATÓRIO DE CORTE (trim) por peça ===");
  for (const p of products) {
    const raw = await getObject(p.imageKey);
    const trim = await analyzeBackgroundTrim(raw);
    const flag = trim.topFraction > 0.3 || trim.bottomFraction > 0.3 ? " ⚠ ACIMA DE 30%!" : "";
    console.log(`  SKU ${p.sku}: topo=${(trim.topFraction * 100).toFixed(1)}% base=${(trim.bottomFraction * 100).toFixed(1)}%${flag}`);
  }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const onlyComparison = process.argv.includes("--only-comparison");

  if (!onlyComparison) {
    console.log(`Carregando ${SAMPLE_SKUS.length} peças reais do banco de amostra (somente leitura: SKUs ${SAMPLE_SKUS.join(", ")})...`);
    const sampleProducts = await resolveProducts(SAMPLE_SKUS);
    const sampleIds = sampleProducts.map((p) => p.id);
    const overrides = await buildAiIdentificationOverride(sampleProducts);

    for (const language of ["pt", "en"] as const) {
      await generateAndSave(
        `AMOSTRA ${language.toUpperCase()} — 10 peças reais, photoFit=trim (default)`,
        `catalogo-amostra-real-${language}.pdf`,
        sampleIds,
        language,
        "trim",
        overrides
      );
    }
  }

  console.log("\n--- Comparação photoFit contain x cover x trim (6 peças reais pedidas, PT) ---");
  const comparisonProducts = await resolveProducts(COMPARISON_SKUS);
  const comparisonIds = comparisonProducts.map((p) => p.id);
  const comparisonOverrides = await buildAiIdentificationOverride(comparisonProducts);

  await generateAndSave("COMPARAÇÃO contain — 6 peças reais", "catalogo-comparacao-contain-pt.pdf", comparisonIds, "pt", "contain", comparisonOverrides);
  await generateAndSave("COMPARAÇÃO cover — 6 peças reais", "catalogo-comparacao-cover-pt.pdf", comparisonIds, "pt", "cover", comparisonOverrides);
  await generateAndSave("COMPARAÇÃO trim — 6 peças reais", "catalogo-comparacao-trim-pt.pdf", comparisonIds, "pt", "trim", comparisonOverrides);

  await printTrimReport(comparisonProducts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
