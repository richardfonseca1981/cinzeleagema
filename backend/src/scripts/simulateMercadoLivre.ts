import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { validateListing, type ListingValidationInput } from "../lib/mercadoLivre/listingValidator";
import { generateTitleSuggestions } from "../lib/mercadoLivre/titleGenerator";
import { buildListingDraft, assertReadyToPublish, type ListingBuilderInput } from "../lib/mercadoLivre/listingBuilder";
import {
  calculateSuggestedPrice,
  calculateMinimumMarkupForBreakeven,
  UNVERIFIED_DEFAULT_COMMISSION_PCT,
  UNVERIFIED_DEFAULT_FIXED_FEE_BRL,
  UNVERIFIED_DEFAULT_SHIPPING_COST_BRL,
} from "../lib/mercadoLivre/priceCalculator";

// Script SOMENTE LEITURA (Fase 1A) — mesma proteção de
// scripts/auditMercadoLivre.ts/generateTitleSuggestions.ts (ver CONTEXT.md
// "Mercado Livre — Fase 1A" para como rodar contra produção, via TCP Proxy
// temporário da Railway). Simula o anúncio (título + preço) de uma lista de
// SKUs específicos, pro Felipe revisar antes de decidir publicar — NENHUMA
// chamada à API do Mercado Livre, NENHUMA escrita no banco.
//
// Uso: npm run simulate:mercadolivre -- SKU1 SKU2 SKU3 [--markup 15]
//  - SKUs: qualquer argumento que não seja --markup/--markup=N.
//  - --markup (opcional): acréscimo % explícito. Sem ele, usa o markupPct
//    da conta Mercado Livre conectada (ver MercadoLivreAccount); sem conta
//    conectada, usa 0 — mesma ordem de prioridade da rota admin
//    GET /simulate/:productId (ver routes/mercadoLivre.routes.ts).
//
// Reaproveita os módulos existentes da Fase 1A, cada um com seu papel:
//  - listingValidator (validateListing): elegibilidade — peça inapta não
//    tem título nem preço calculado, só os motivos no CSV.
//  - titleGenerator (generateTitleSuggestions): título (variação A) — chamado
//    UMA VEZ com o lote inteiro (não peça a peça) pra manter a
//    desduplicação entre peças de mesmo nome (ver titleGenerator.ts).
//  - priceCalculator (calculateSuggestedPrice/calculateMinimumMarkupForBreakeven):
//    breakdown de preço e o markup mínimo pra não dar prejuízo frente ao
//    preço já praticado hoje.
//  - listingBuilder (buildListingDraft/assertReadyToPublish): sinaliza
//    quando a categoria ainda não foi verificada (placeholder da Fase 1A —
//    ver categoryFixture.ts), o que bloquearia a publicação real.
//
// Somente leitura em DOIS níveis, não só "só chamamos findMany":
//  1) Código: as únicas chamadas ao Prisma aqui são product.findMany e
//     mercadoLivreAccount.findFirst (SELECT).
//  2) Conexão/transação: SET TRANSACTION READ ONLY é a primeira instrução da
//     transação — o Postgres passa a rejeitar qualquer INSERT/UPDATE/DELETE
//     dentro dela com erro, mesmo que um bug futuro neste arquivo tente
//     escrever. Isso é reforço de defesa, não confiança no código acima.
//
// AS TAXAS (comissão, tarifa fixa, frete) SÃO ESTIMATIVAS NÃO VERIFICADAS
// contra a documentação oficial do Mercado Livre — ver priceCalculator.ts
// UNVERIFIED_DEFAULT_*. Marcado no nome das colunas do CSV de propósito,
// pra nunca ficar implícito numa planilha aberta fora de contexto.

// price já vem de ListingValidationInput (unknown — Decimal do Prisma ou já
// convertido); a intersecção só soma o que falta: imagens com url/position
// (ListingBuilderInput) além de width/height (ListingValidationInput).
type SimulationProduct = ListingValidationInput & ListingBuilderInput;

export interface SimulationCsvRow {
  sku: string;
  titulo: string;
  preco_base: string;
  acrescimo: string;
  preco_anuncio: string;
  comissao_estimativa_nao_verificada: string;
  tarifa_fixa_estimativa_nao_verificada: string;
  frete_estimado_estimativa_nao_verificada: string;
  liquido_estimado: string;
  markup_minimo_breakeven: string;
  avisos: string;
}

const CSV_HEADER: (keyof SimulationCsvRow)[] = [
  "sku",
  "titulo",
  "preco_base",
  "acrescimo",
  "preco_anuncio",
  "comissao_estimativa_nao_verificada",
  "tarifa_fixa_estimativa_nao_verificada",
  "frete_estimado_estimativa_nao_verificada",
  "liquido_estimado",
  "markup_minimo_breakeven",
  "avisos",
];

function describeDatabase(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "(DATABASE_URL ausente ou inválida)";
  }
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// "" (nunca "0.00") quando o valor é ausente — mesma convenção dos outros
// scripts (ver auditMercadoLivre.ts). "N/D" quando o markup mínimo não é um
// número finito (comissão >= 100%, nenhum acréscimo finito cobre o preço
// base — ver priceCalculator.ts calculateMinimumMarkupForBreakeven).
function formatDecimal(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "N/D";
}

export function parseArgs(argv: string[]): { skus: string[]; markupPctArg: number | null } {
  const skus: string[] = [];
  let markupPctArg: number | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--markup") {
      const value = argv[i + 1];
      markupPctArg = value === undefined ? NaN : Number(value);
      i++;
    } else if (arg.startsWith("--markup=")) {
      markupPctArg = Number(arg.slice("--markup=".length));
    } else {
      skus.push(arg);
    }
  }

  return { skus, markupPctArg };
}

export function buildSimulationCsvRows(
  requestedSkus: string[],
  products: SimulationProduct[],
  markupPct: number
): SimulationCsvRow[] {
  const productsBySku = new Map(products.filter((p) => p.sku !== null).map((p) => [p.sku as string, p]));
  const titleSuggestionsById = new Map(generateTitleSuggestions(products).map((row) => [row.id, row]));

  return requestedSkus.map((sku) => {
    const product = productsBySku.get(sku);
    if (!product) {
      return {
        sku,
        titulo: "",
        preco_base: "",
        acrescimo: "",
        preco_anuncio: "",
        comissao_estimativa_nao_verificada: "",
        tarifa_fixa_estimativa_nao_verificada: "",
        frete_estimado_estimativa_nao_verificada: "",
        liquido_estimado: "",
        markup_minimo_breakeven: "",
        avisos: "sku_nao_encontrado",
      };
    }

    const eligibility = validateListing(product);
    if (!eligibility.eligible) {
      return {
        sku,
        titulo: "",
        preco_base: "",
        acrescimo: "",
        preco_anuncio: "",
        comissao_estimativa_nao_verificada: "",
        tarifa_fixa_estimativa_nao_verificada: "",
        frete_estimado_estimativa_nao_verificada: "",
        liquido_estimado: "",
        markup_minimo_breakeven: "",
        avisos: eligibility.blockers.map((blocker) => blocker.code).join("; "),
      };
    }

    const titleRow = titleSuggestionsById.get(product.id);
    const warnings: string[] = (titleRow?.warnings ?? []).map((warning) => warning.code);

    try {
      assertReadyToPublish(buildListingDraft(product));
    } catch {
      warnings.push("category_not_verified");
    }

    const priceConfig = {
      markupPct,
      commissionPct: UNVERIFIED_DEFAULT_COMMISSION_PCT,
      fixedFeeBRL: UNVERIFIED_DEFAULT_FIXED_FEE_BRL,
      shippingCostBRL: UNVERIFIED_DEFAULT_SHIPPING_COST_BRL,
    };
    const basePrice = Number(product.price);
    const price = calculateSuggestedPrice(basePrice, priceConfig);
    const minMarkup = calculateMinimumMarkupForBreakeven(basePrice, {
      commissionPct: priceConfig.commissionPct,
      fixedFeeBRL: priceConfig.fixedFeeBRL,
      shippingCostBRL: priceConfig.shippingCostBRL,
    });

    return {
      sku,
      titulo: titleRow?.titleA ?? "",
      preco_base: formatDecimal(price.basePrice),
      acrescimo: formatDecimal(price.markupAmount),
      preco_anuncio: formatDecimal(price.listingPrice),
      comissao_estimativa_nao_verificada: formatDecimal(price.commissionAmount),
      tarifa_fixa_estimativa_nao_verificada: formatDecimal(price.fixedFeeBRL),
      frete_estimado_estimativa_nao_verificada: formatDecimal(price.shippingCostBRL),
      liquido_estimado: formatDecimal(price.netReceived),
      markup_minimo_breakeven: formatDecimal(minMarkup),
      avisos: warnings.join("; "),
    };
  });
}

// BOM UTF-8 (code point U+FEFF) na primeira posição — sem ele, o Excel no
// Windows abre o CSV com a codificação errada e nomes acentuados ("Ágata",
// "Esmeralda") aparecem corrompidos. fromCharCode em vez de um caractere
// invisível direto no source (fácil de perder num editor/diff).
const UTF8_BOM = String.fromCharCode(0xfeff);

export function buildSimulationCsvContent(requestedSkus: string[], products: SimulationProduct[], markupPct: number): string {
  const rows = buildSimulationCsvRows(requestedSkus, products, markupPct);
  const lines = [CSV_HEADER.join(","), ...rows.map((row) => CSV_HEADER.map((key) => csvEscape(row[key])).join(","))];
  return `${UTF8_BOM}${lines.join("\n")}\n`;
}

async function fetchReadOnly(skus: string[]): Promise<{ products: SimulationProduct[]; accountMarkupPct: number | null }> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");

      const products = await tx.product.findMany({
        where: { sku: { in: skus } },
        include: { images: { orderBy: { position: "asc" } } },
      });

      const account = await tx.mercadoLivreAccount.findFirst({ orderBy: { updatedAt: "desc" } });
      const accountMarkupPct = account ? Number(account.markupPct) : null;

      return { products, accountMarkupPct };
    },
    // timeout maior que o default (5s) — rodar via proxy TCP da Railway
    // (CONTEXT.md) adiciona latência de rede que o padrão não cobre.
    { timeout: 30_000 }
  );
}

async function main() {
  const { skus, markupPctArg } = parseArgs(process.argv.slice(2));
  if (skus.length === 0) {
    console.error("Uso: npm run simulate:mercadolivre -- SKU1 SKU2 ... [--markup 15]");
    process.exitCode = 1;
    return;
  }
  if (markupPctArg !== null && !Number.isFinite(markupPctArg)) {
    console.error("--markup precisa ser um número (ex.: --markup 15 ou --markup=15).");
    process.exitCode = 1;
    return;
  }

  console.log(`Banco: ${describeDatabase()} (transação SET TRANSACTION READ ONLY)`);

  const { products, accountMarkupPct } = await fetchReadOnly(skus);

  const markupPct = markupPctArg ?? accountMarkupPct ?? 0;
  const markupSource = markupPctArg !== null ? "argumento --markup" : accountMarkupPct !== null ? "conta Mercado Livre conectada" : "padrão (sem conta conectada)";
  console.log(`Markup usado: ${markupPct}% (fonte: ${markupSource})`);
  console.log("Comissão/tarifa fixa/frete: estimativas NÃO verificadas contra a API oficial do Mercado Livre — ver colunas do CSV.");

  const csv = buildSimulationCsvContent(skus, products, markupPct);
  const outputPath = path.resolve(__dirname, "../../simulacao-mercadolivre.csv");
  fs.writeFileSync(outputPath, csv, "utf8");

  const rows = buildSimulationCsvRows(skus, products, markupPct);
  const comPreco = rows.filter((row) => row.preco_base !== "").length;
  console.log(`Total de SKUs pedidos: ${rows.length} (com simulação de preço: ${comPreco}, sem: ${rows.length - comPreco})`);
  console.log(`CSV gravado em: ${outputPath}`);
}

// Guard de entry-point (mesmo padrão de auditMercadoLivre.ts/
// generateTitleSuggestions.ts): só roda main() quando o arquivo é executado
// diretamente (CLI). Sem isso, só importar buildSimulationCsvRows/
// buildSimulationCsvContent para teste já dispararia uma leitura real no
// banco como efeito colateral do import.
if (require.main === module) {
  main()
    .catch((err) => {
      console.error("Erro:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
