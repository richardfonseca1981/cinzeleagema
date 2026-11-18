import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { generateTitleSuggestions, type TitleGenerationInput } from "../lib/mercadoLivre/titleGenerator";

// Script SOMENTE LEITURA (Fase 1A) — mesma proteção de
// scripts/auditMercadoLivre.ts (ver CONTEXT.md "Mercado Livre — Fase 1A"
// para como rodar contra produção, via TCP Proxy temporário da Railway).
// Uso: `npm run generate:ml-titles` dentro de backend/ (ou
// `npx tsx src/scripts/generateTitleSuggestions.ts`).
//
// Gera, para cada peça APTA (mesma regra de elegibilidade do resto da Fase
// 1A — ver listingValidator.ts), até 2 sugestões de título de anúncio
// (<=60 chars, nunca corta palavra no meio, nunca duplicado entre peças do
// catálogo) para o Felipe aprovar manualmente. NENHUMA chamada à API do
// Mercado Livre, NENHUMA escrita no banco — só leitura + geração em
// memória + CSV.
//
// Somente leitura em DOIS níveis, não só "só chamamos findMany":
//  1) Código: a única chamada ao Prisma aqui é product.findMany (SELECT).
//  2) Conexão/transação: SET TRANSACTION READ ONLY é a primeira instrução da
//     transação — o Postgres passa a rejeitar qualquer INSERT/UPDATE/DELETE
//     dentro dela com erro, mesmo que um bug futuro neste arquivo tente
//     escrever. Isso é reforço de defesa, não confiança no código acima.

export interface TitleSuggestionCsvRow {
  sku: string;
  nome_atual: string;
  titulo_a: string;
  titulo_a_tamanho: string;
  titulo_b: string;
  titulo_b_tamanho: string;
  avisos: string;
}

const CSV_HEADER: (keyof TitleSuggestionCsvRow)[] = ["sku", "nome_atual", "titulo_a", "titulo_a_tamanho", "titulo_b", "titulo_b_tamanho", "avisos"];

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

export function buildTitleSuggestionCsvRows(products: TitleGenerationInput[]): TitleSuggestionCsvRow[] {
  const suggestions = generateTitleSuggestions(products);
  return suggestions.map((row) => ({
    sku: row.sku ?? "",
    nome_atual: row.currentName,
    titulo_a: row.titleA ?? "",
    titulo_a_tamanho: row.titleALength === null ? "" : String(row.titleALength),
    titulo_b: row.titleB ?? "",
    titulo_b_tamanho: row.titleBLength === null ? "" : String(row.titleBLength),
    avisos: row.warnings.map((warning) => warning.code).join("; "),
  }));
}

// BOM UTF-8 (code point U+FEFF) na primeira posição — sem ele, o Excel no
// Windows abre o CSV com a codificação errada e nomes acentuados ("Ágata",
// "Esmeralda") aparecem corrompidos. fromCharCode em vez de um caractere
// invisível direto no source (fácil de perder num editor/diff).
const UTF8_BOM = String.fromCharCode(0xfeff);

export function buildTitleSuggestionCsvContent(products: TitleGenerationInput[]): string {
  const rows = buildTitleSuggestionCsvRows(products);
  const lines = [CSV_HEADER.join(","), ...rows.map((row) => CSV_HEADER.map((key) => csvEscape(row[key])).join(","))];
  return `${UTF8_BOM}${lines.join("\n")}\n`;
}

async function fetchProductsReadOnly(): Promise<TitleGenerationInput[]> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return tx.product.findMany({
        include: { images: { orderBy: { position: "asc" } } },
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
  const csv = buildTitleSuggestionCsvContent(products);

  const outputPath = path.resolve(__dirname, "../../sugestoes-titulo-mercadolivre.csv");
  fs.writeFileSync(outputPath, csv, "utf8");

  const rows = buildTitleSuggestionCsvRows(products);
  const comSugestao = rows.filter((row) => row.titulo_a !== "").length;
  console.log(`Total de peças: ${rows.length} (com sugestão de título: ${comSugestao}, sem: ${rows.length - comSugestao})`);
  console.log(`CSV gravado em: ${outputPath}`);
}

// Guard de entry-point (mesmo padrão de auditMercadoLivre.ts/
// promoteFormasToCategory.ts): só roda main() quando o arquivo é executado
// diretamente (CLI). Sem isso, só importar buildTitleSuggestionCsvRows/
// buildTitleSuggestionCsvContent para teste já dispararia uma leitura real
// no banco como efeito colateral do import.
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
