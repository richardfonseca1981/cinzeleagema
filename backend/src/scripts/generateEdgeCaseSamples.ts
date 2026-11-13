import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import PDFDocument from "pdfkit";
import { registerCatalogFonts, drawCoverPage, drawContactPage, drawProductPage, computeProductPanelLayout } from "../lib/catalog/pdfPages";
import { processCatalogPhoto } from "../lib/catalog/photoLayer";
import { PAGE_HEIGHT, PAGE_WIDTH } from "../lib/catalog/layout";
import type { CatalogLanguage } from "../lib/catalog/content";

// Gera catalogo-amostra-pt.pdf / catalogo-amostra-en.pdf cobrindo os casos de
// borda pedidos (nome longo, sem peso, sem descrição) SEM tocar o banco de
// dados — ao contrário de scripts/generateSampleCatalog.ts, que lê peças
// reais (somente leitura, mas ainda assim lê o banco). O banco local só tem
// 3 peças de seed, nenhuma com esses casos de borda, e o pedido é
// explicitamente somente leitura: nunca alterar peças nem fotos para criar
// fixtures de teste. Em vez disso, desenha as páginas de peça diretamente
// (drawProductPage) com dados sintéticos e fotos geradas em memória —
// exercita o mesmo código de layout/texto do catálogo real, sem nenhuma
// leitura/escrita no Product.

const OUTPUT_DIR = path.resolve(__dirname, "../../tmp");

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Foto sintética 9:16 (proporção típica das fotos de peça) em tons diferentes
// só para distinguir visualmente cada página de amostra.
async function syntheticPhoto(color: { r: number; g: number; b: number }, photoAreaHeight: number) {
  const raw = await sharp({ create: { width: 900, height: 1600, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
  return processCatalogPhoto(raw, { quality: "standard", photoAreaHeight });
}

interface SampleSpec {
  title: string;
  sku: string | null;
  bodyText: string | null;
  sizeCm: number;
  weightGrams: number;
  price: number | null;
  color: { r: number; g: number; b: number };
}

const SAMPLES: Record<CatalogLanguage, SampleSpec[]> = {
  pt: [
    {
      title:
        "Pedra Extraordinária Rara de Origem Totalmente Desconhecida com Nome Comercial Muito Longo e Detalhado Demais Para Caber em Três Linhas Mesmo no Tamanho Mínimo de Fonte Permitido",
      sku: "AMOSTRA-NOME-LONGO",
      bodyText: "Peça lapidada à mão, com brilho intenso e variações naturais de tonalidade — exemplo de descrição própria da peça.",
      sizeCm: 2.3,
      weightGrams: 850,
      price: 1200,
      color: { r: 120, g: 80, b: 160 },
    },
    {
      title: "Ametista Geoda Sem Peso Cadastrado",
      sku: "AMOSTRA-SEM-PESO",
      bodyText: "Geodo roxo intenso, lapidação natural, base polida.",
      sizeCm: 18,
      weightGrams: 0,
      price: 650,
      color: { r: 90, g: 60, b: 140 },
    },
    {
      title: "Esmeralda Colombiana Sem Descrição",
      sku: "AMOSTRA-SEM-DESC",
      bodyText: null,
      sizeCm: 0.9,
      weightGrams: 46,
      price: 8500,
      color: { r: 30, g: 110, b: 70 },
    },
    {
      title: "Topázio Imperial Completo",
      sku: "AMOSTRA-COMPLETA",
      bodyText: "Topázio imperial de Ouro Preto, com laudo gemológico e lapidação oval impecável.",
      sizeCm: 1.1,
      weightGrams: 1620,
      price: 4200,
      color: { r: 200, g: 140, b: 40 },
    },
  ],
  en: [
    {
      title:
        "Extraordinarily Rare Gemstone of Completely Unknown Origin with a Very Long and Overly Detailed Commercial Name That Cannot Fit in Three Lines Even at the Minimum Allowed Font Size",
      sku: "SAMPLE-LONG-NAME",
      bodyText: "Hand-cut piece with intense brilliance and natural color variation — example of the piece's own description.",
      sizeCm: 2.3,
      weightGrams: 850,
      price: 1200,
      color: { r: 120, g: 80, b: 160 },
    },
    {
      title: "Amethyst Geode With No Registered Weight",
      sku: "SAMPLE-NO-WEIGHT",
      bodyText: "Deep purple geode, natural cut, polished base.",
      sizeCm: 18,
      weightGrams: 0,
      price: 650,
      color: { r: 90, g: 60, b: 140 },
    },
    {
      title: "Colombian Emerald With No Description",
      sku: "SAMPLE-NO-DESC",
      bodyText: null,
      sizeCm: 0.9,
      weightGrams: 46,
      price: 8500,
      color: { r: 30, g: 110, b: 70 },
    },
    {
      title: "Imperial Topaz, Complete",
      sku: "SAMPLE-COMPLETE",
      bodyText: "Imperial topaz from Ouro Preto, with gemological report and flawless oval cut.",
      sizeCm: 1.1,
      weightGrams: 1620,
      price: 4200,
      color: { r: 200, g: 140, b: 40 },
    },
  ],
};

async function generateSample(language: CatalogLanguage): Promise<{ path: string; bytes: number; pages: number; truncated: boolean[] }> {
  const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margins: { top: 0, bottom: 0, left: 0, right: 0 }, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  registerCatalogFonts(doc);

  let pages = 0;
  doc.addPage();
  pages++;
  drawCoverPage(doc, { language, generatedAt: new Date() });

  // Página de informações na 2ª posição (FIX CATÁLOGO/PÁGINA DE
  // INFORMAÇÕES) — mesma ordem de generateCatalogPdf.ts, para este script de
  // amostra continuar representando o catálogo real.
  doc.addPage();
  pages++;
  drawContactPage(doc, { language });

  const truncated: boolean[] = [];
  for (const spec of SAMPLES[language]) {
    const layout = computeProductPanelLayout(doc, {
      language,
      title: spec.title,
      sku: spec.sku,
      showRef: true,
      body: spec.bodyText ? { text: spec.bodyText, source: "description" } : null,
      sizeCm: spec.sizeCm,
      weightGrams: spec.weightGrams,
      showPrice: true,
    });
    const photo = await syntheticPhoto(spec.color, layout.photoAreaHeight);
    doc.addPage();
    pages++;
    drawProductPage(doc, {
      language,
      showPrice: true,
      exchangeRate: language === "en" ? 5.3 : null,
      photo,
      price: spec.price,
      seed: spec.sku ?? spec.title,
      layout,
    });
    truncated.push(layout.title.truncated);
  }

  doc.end();
  const buffer = await finished;

  const outputPath = path.join(OUTPUT_DIR, `catalogo-amostra-${language}.pdf`);
  await fs.writeFile(outputPath, buffer);
  return { path: outputPath, bytes: buffer.length, pages, truncated };
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const language of ["pt", "en"] as const) {
    const start = Date.now();
    const result = await generateSample(language);
    const elapsedMs = Date.now() - start;
    console.log(`\n[${language.toUpperCase()}]`);
    console.log(`  arquivo: ${result.path}`);
    console.log(`  tamanho: ${formatBytes(result.bytes)}`);
    console.log(`  páginas: ${result.pages}`);
    console.log(`  tempo: ${(elapsedMs / 1000).toFixed(1)}s`);
    console.log(`  título truncado por peça: ${result.truncated.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
