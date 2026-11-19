import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { validateListing, type ListingValidationInput } from "../lib/mercadoLivre/listingValidator";
import { generateTitleSuggestions } from "../lib/mercadoLivre/titleGenerator";
import { buildListingDraft, getReadinessIssues, type ListingBuilderInput } from "../lib/mercadoLivre/listingBuilder";
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
//  - listingBuilder (buildListingDraft/getReadinessIssues): sinaliza quando
//    a categoria ainda não foi verificada (placeholder da Fase 1A — ver
//    categoryFixture.ts) e/ou quando a peça excede o maior preset de
//    embalagem (GG — ver packagePresets.ts), o que bloquearia a publicação
//    real. getReadinessIssues (não assertReadyToPublish) porque o CSV
//    precisa mostrar os DOIS motivos quando os dois se aplicarem, não só o
//    primeiro que a versão que lança pararia em.
//
// Somente leitura em DOIS níveis, não só "só chamamos findMany":
//  1) Código: as únicas chamadas ao Prisma aqui são product.findMany e
//     mercadoLivreAccount.findFirst (SELECT).
//  2) Conexão/transação: SET TRANSACTION READ ONLY é a primeira instrução da
//     transação — o Postgres passa a rejeitar qualquer INSERT/UPDATE/DELETE
//     dentro dela com erro, mesmo que um bug futuro neste arquivo tente
//     escrever. Isso é reforço de defesa, não confiança no código acima.
//
// Produção hoje NÃO tem a migração da Fase 0 aplicada (tabela
// MercadoLivreAccount não existe) — e este script NUNCA aplica migração.
// Por isso: com --markup explícito, a tabela nem é consultada (item
// desnecessário para o resultado); sem --markup, uma tabela ausente
// (Prisma P2021) é tratada como "sem conta conectada" (markup 0 + aviso),
// nunca um erro fatal — ver fetchReadOnly.
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
  // Preset de caixa de embalagem (ver lib/mercadoLivre/packagePresets.ts) —
  // vazio quando a peça excede o maior preset (GG); o motivo aparece em
  // "avisos" (package_requires_manual). SUPOSIÇÃO não verificada, igual às
  // colunas de taxa acima.
  caixa_estimada_estimativa_nao_verificada: string;
  peso_pacote_g_estimativa_nao_verificada: string;
  // Fase 1B etapa 10 — "manual" quando a caixa veio do override da peça
  // (Product.mlPackageOverride*), "preset" quando veio da estimativa
  // automática; vazio junto com as duas colunas acima quando bloqueado.
  origem_caixa: string;
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
  "caixa_estimada_estimativa_nao_verificada",
  "peso_pacote_g_estimativa_nao_verificada",
  "origem_caixa",
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

// Aviso global do lote (ex.: "conta ML ausente: markup 0" — ver
// fetchReadOnly) anexado em TODAS as linhas, inclusive sku_nao_encontrado e
// peça inapta: é sobre a fonte do markup usado na rodada inteira, não sobre
// uma peça específica, então quem revisa o CSV precisa vê-lo em qualquer
// linha que abrir.
function appendWarning(codes: string[], extra: string | null): string {
  return extra ? [...codes, extra].join("; ") : codes.join("; ");
}

export function buildSimulationCsvRows(
  requestedSkus: string[],
  products: SimulationProduct[],
  markupPct: number,
  accountWarning: string | null = null
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
        caixa_estimada_estimativa_nao_verificada: "",
        peso_pacote_g_estimativa_nao_verificada: "",
        origem_caixa: "",
        avisos: appendWarning(["sku_nao_encontrado"], accountWarning),
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
        caixa_estimada_estimativa_nao_verificada: "",
        peso_pacote_g_estimativa_nao_verificada: "",
        origem_caixa: "",
        avisos: appendWarning(eligibility.blockers.map((blocker) => blocker.code), accountWarning),
      };
    }

    const titleRow = titleSuggestionsById.get(product.id);
    const warnings: string[] = (titleRow?.warnings ?? []).map((warning) => warning.code);

    const draft = buildListingDraft(product);
    warnings.push(...getReadinessIssues(draft));

    // Mostra a caixa/peso estimados SEMPRE que o preset deu certo (ok:
    // true) — independente de a categoria ainda bloquear a publicação de
    // verdade nesta fase (as duas checagens são independentes, ver
    // getReadinessIssues). Vazio só quando a peça excede o maior preset
    // (ok: false) — "avisos" já carrega package_requires_manual nesse caso.
    // preset é null quando a origem é "manual" (ver packagePresets.ts) — cai
    // pra "manual" no texto nesse caso, nunca "null" literal.
    const caixaEstimada = draft.packageBox.ok
      ? `${draft.packageBox.preset ?? "manual"} (${draft.packageBox.box.lengthCm}x${draft.packageBox.box.widthCm}x${draft.packageBox.box.heightCm}cm)`
      : "";
    const pesoPacoteEstimado = draft.packageBox.ok ? String(draft.packageBox.packageWeightGrams) : "";
    const origemCaixa = draft.packageBoxSource ?? "";

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

    // Fonte ÚNICA de título (mesma regra de listingBuilder.ts
    // resolveDraftTitle): mlTitle aprovado sempre vence. Sem aprovação,
    // usa titleRow.titleA (não draft.title) de propósito — titleRow vem de
    // generateTitleSuggestions(products) com o LOTE INTEIRO dos SKUs
    // pedidos, mantendo a desduplicação por peso entre peças de mesmo nome
    // (ver teste "reaproveita a desduplicação em lote..."); draft.title
    // reconstruiria a sugestão isoladamente, sem ver as peças vizinhas do
    // lote. "avisos" já carrega title_not_approved via getReadinessIssues
    // quando não há aprovação.
    const approvedTitle = product.mlTitle?.trim();
    const titulo = approvedTitle && product.mlTitleApprovedAt ? approvedTitle : titleRow?.titleA ?? "";

    return {
      sku,
      titulo,
      preco_base: formatDecimal(price.basePrice),
      acrescimo: formatDecimal(price.markupAmount),
      preco_anuncio: formatDecimal(price.listingPrice),
      comissao_estimativa_nao_verificada: formatDecimal(price.commissionAmount),
      tarifa_fixa_estimativa_nao_verificada: formatDecimal(price.fixedFeeBRL),
      frete_estimado_estimativa_nao_verificada: formatDecimal(price.shippingCostBRL),
      liquido_estimado: formatDecimal(price.netReceived),
      markup_minimo_breakeven: formatDecimal(minMarkup),
      caixa_estimada_estimativa_nao_verificada: caixaEstimada,
      peso_pacote_g_estimativa_nao_verificada: pesoPacoteEstimado,
      origem_caixa: origemCaixa,
      avisos: appendWarning(warnings, accountWarning),
    };
  });
}

// BOM UTF-8 (code point U+FEFF) na primeira posição — sem ele, o Excel no
// Windows abre o CSV com a codificação errada e nomes acentuados ("Ágata",
// "Esmeralda") aparecem corrompidos. fromCharCode em vez de um caractere
// invisível direto no source (fácil de perder num editor/diff).
const UTF8_BOM = String.fromCharCode(0xfeff);

export function buildSimulationCsvContent(
  requestedSkus: string[],
  products: SimulationProduct[],
  markupPct: number,
  accountWarning: string | null = null
): string {
  const rows = buildSimulationCsvRows(requestedSkus, products, markupPct, accountWarning);
  const lines = [CSV_HEADER.join(","), ...rows.map((row) => CSV_HEADER.map((key) => csvEscape(row[key])).join(","))];
  return `${UTF8_BOM}${lines.join("\n")}\n`;
}

// Aviso usado em main()/CSV quando o markup cai pra 0 por falta de conta
// Mercado Livre — mesmo texto tanto pra "tabela ainda não existe em
// produção" (P2021, migração da Fase 0 não aplicada) quanto pra "tabela
// existe mas nenhuma conta foi conectada ainda": do ponto de vista de quem
// lê o CSV, o resultado prático é idêntico (markup 0, revisar manualmente).
export const ACCOUNT_UNAVAILABLE_WARNING = "conta ML ausente: markup 0";

export async function fetchReadOnly(
  skus: string[],
  markupPctArg: number | null
): Promise<{ products: SimulationProduct[]; accountMarkupPct: number | null; accountUnavailable: boolean }> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");

      const products = await tx.product.findMany({
        where: { sku: { in: skus } },
        include: { images: { orderBy: { position: "asc" } } },
      });

      // --markup explícito: o markup não depende da conta — nem consultamos
      // a tabela, então um --markup informado funciona mesmo que
      // MercadoLivreAccount ainda não exista (produção hoje).
      if (markupPctArg !== null) {
        return { products, accountMarkupPct: null, accountUnavailable: false };
      }

      try {
        const account = await tx.mercadoLivreAccount.findFirst({ orderBy: { updatedAt: "desc" } });
        return { products, accountMarkupPct: account ? Number(account.markupPct) : null, accountUnavailable: account === null };
      } catch (err) {
        // P2021 = tabela não existe (migração da Fase 0 não aplicada em
        // produção). Nunca relançar como fatal nem tentar migrar/escrever
        // aqui — cai para "sem conta", igual a não encontrar nenhuma linha.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
          return { products, accountMarkupPct: null, accountUnavailable: true };
        }
        throw err;
      }
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

  const { products, accountMarkupPct, accountUnavailable } = await fetchReadOnly(skus, markupPctArg);

  const accountWarning = accountUnavailable ? ACCOUNT_UNAVAILABLE_WARNING : null;
  const markupPct = markupPctArg ?? accountMarkupPct ?? 0;
  const markupSource = markupPctArg !== null ? "argumento --markup" : accountMarkupPct !== null ? "conta Mercado Livre conectada" : "padrão (sem conta conectada)";
  console.log(`Markup usado: ${markupPct}% (fonte: ${markupSource})`);
  if (accountWarning) console.log(accountWarning);
  console.log("Comissão/tarifa fixa/frete: estimativas NÃO verificadas contra a API oficial do Mercado Livre — ver colunas do CSV.");

  const csv = buildSimulationCsvContent(skus, products, markupPct, accountWarning);
  const outputPath = path.resolve(__dirname, "../../simulacao-mercadolivre.csv");
  fs.writeFileSync(outputPath, csv, "utf8");

  const rows = buildSimulationCsvRows(skus, products, markupPct, accountWarning);
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
