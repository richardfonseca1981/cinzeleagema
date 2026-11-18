import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { buildPublicSlug } from "../lib/publicSlug";
import {
  countUnknownDimensionPhotos,
  validateListing,
  type ListingValidationInput,
} from "../lib/mercadoLivre/listingValidator";

// Script SOMENTE LEITURA (Fase 1A) — ver CONTEXT.md "Mercado Livre — Fase
// 1A" para como rodar contra produção (proxy TCP somente leitura da
// Railway). Uso: `npm run audit:mercadolivre` dentro de backend/ (ou
// `npx tsx src/scripts/auditMercadoLivre.ts`).
//
// Somente leitura em DOIS níveis, não só "só chamamos findMany":
//  1) Código: a única chamada ao Prisma aqui é product.findMany (SELECT).
//  2) Conexão/transação: SET TRANSACTION READ ONLY é a primeira instrução da
//     transação — o Postgres passa a rejeitar qualquer INSERT/UPDATE/DELETE
//     dentro dela com erro, mesmo que um bug futuro neste arquivo tente
//     escrever. Isso é reforço de defesa, não confiança no código acima.
//
// Decisão do operador contra qual banco rodar: este script lê a
// DATABASE_URL do .env/ambiente ativo sem distinguir dev/produção além de
// exibir o host abaixo — confirme a variável antes de rodar.

export interface AuditProductRow extends ListingValidationInput {
  category: { name: string } | null;
  subcategory: { name: string } | null;
}

export interface AuditRow {
  id: string;
  sku: string;
  nome: string;
  apto: string;
  preco: string;
  weightGrams: string;
  sizeCm: string;
  categoria: string;
  subcategoria: string;
  quantidade_de_fotos: string;
  fotos_dimensao_desconhecida: string;
  url_publica: string;
  motivos: string;
  avisos: string;
}

const CSV_HEADER: (keyof AuditRow)[] = [
  "id",
  "sku",
  "nome",
  "apto",
  "preco",
  "weightGrams",
  "sizeCm",
  "categoria",
  "subcategoria",
  "quantidade_de_fotos",
  "fotos_dimensao_desconhecida",
  "url_publica",
  "motivos",
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

// "" (nunca "0.00" nem "null") quando o valor é ausente — mesma convenção do
// resto do CSV para campo vazio, para não confundir com um preço/peso real
// de zero.
function formatDecimal(value: unknown): string {
  if (value === null || value === undefined) return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

// Mesmo cálculo de slug do sitemap público (buildPublicSlug, nome atual +
// sufixo estável do id) — para o link do CSV cair exatamente na URL real da
// peça no site, hoje ou depois de o nome ser editado.
function buildPublicUrl(product: Pick<AuditProductRow, "name" | "id">): string {
  const base = env.PUBLIC_SITE_URL.replace(/\/+$/, "");
  return `${base}/catalogo/${buildPublicSlug(product.name, product.id)}`;
}

export function buildAuditRows(products: AuditProductRow[]): AuditRow[] {
  return products.map((product) => {
    const result = validateListing(product);
    return {
      id: product.id,
      sku: product.sku ?? "",
      nome: product.name ?? "",
      apto: result.eligible ? "sim" : "nao",
      preco: formatDecimal(product.price),
      weightGrams: formatDecimal(product.weightGrams),
      sizeCm: formatDecimal(product.sizeCm),
      categoria: product.category?.name ?? "",
      subcategoria: product.subcategory?.name ?? "",
      quantidade_de_fotos: String(product.images.length),
      fotos_dimensao_desconhecida: String(countUnknownDimensionPhotos(product.images)),
      url_publica: buildPublicUrl(product),
      motivos: result.blockers.map((b) => b.code).join("; "),
      avisos: result.warnings.map((w) => w.code).join("; "),
    };
  });
}

// BOM UTF-8 (code point U+FEFF) na primeira posição — sem ele, o Excel no
// Windows abre o CSV com a codificação errada e nomes acentuados ("Ágata",
// "Esmeralda") aparecem corrompidos. Node grava U+FEFF como os 3 bytes EF BB
// BF em utf8, exatamente o BOM que o Excel espera. fromCharCode em vez de um
// caractere invisível direto no source (fácil de perder num editor/diff).
const UTF8_BOM = String.fromCharCode(0xfeff);

export function buildCsvContent(products: AuditProductRow[]): string {
  const rows = buildAuditRows(products);
  const lines = [CSV_HEADER.join(","), ...rows.map((row) => CSV_HEADER.map((key) => csvEscape(row[key])).join(","))];
  return `${UTF8_BOM}${lines.join("\n")}\n`;
}

async function fetchProductsReadOnly(): Promise<AuditProductRow[]> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return tx.product.findMany({
        include: {
          images: { orderBy: { position: "asc" } },
          category: { select: { name: true } },
          subcategory: { select: { name: true } },
        },
        orderBy: { sortOrder: "asc" },
      });
    },
    // timeout maior que o default (5s) — rodar via proxy TCP da Railway
    // (CONTEXT.md) adiciona latência de rede que o padrão não cobre.
    { timeout: 30_000 }
  );
}

async function main() {
  console.log(`Banco: ${describeDatabase()} (transação SET TRANSACTION READ ONLY)`);

  const products = await fetchProductsReadOnly();
  const csv = buildCsvContent(products);

  const outputPath = path.resolve(__dirname, "../../auditoria-mercadolivre.csv");
  fs.writeFileSync(outputPath, csv, "utf8");

  const rows = buildAuditRows(products);
  const aptos = rows.filter((row) => row.apto === "sim").length;
  console.log(`Total de peças: ${rows.length} (aptas: ${aptos}, inaptas: ${rows.length - aptos})`);
  console.log(`CSV gravado em: ${outputPath}`);
}

// Guard de entry-point (mesmo padrão de promoteFormasToCategory.ts): só
// roda main() quando o arquivo é executado diretamente (CLI). Sem isso, só
// importar buildAuditRows/buildCsvContent para teste (ver
// tests/auditMercadoLivre.test.ts) já dispararia uma leitura real no banco
// como efeito colateral do import.
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
