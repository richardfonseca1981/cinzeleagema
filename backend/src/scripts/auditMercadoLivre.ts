import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { countUnknownDimensionPhotos, validateListing } from "../lib/mercadoLivre/listingValidator";

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

async function fetchProductsReadOnly() {
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

  const rows = products.map((product) => {
    const result = validateListing(product);
    return {
      id: product.id,
      sku: product.sku ?? "",
      nome: product.name ?? "",
      apto: result.eligible ? "sim" : "nao",
      fotos: String(product.images.length),
      fotos_dimensao_desconhecida: String(countUnknownDimensionPhotos(product.images)),
      motivos: result.blockers.map((b) => b.code).join("; "),
      avisos: result.warnings.map((w) => w.code).join("; "),
    };
  });

  const header = ["id", "sku", "nome", "apto", "fotos", "fotos_dimensao_desconhecida", "motivos", "avisos"] as const;
  const lines = [header.join(","), ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(","))];

  const outputPath = path.resolve(__dirname, "../../auditoria-mercadolivre.csv");
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");

  const aptos = rows.filter((row) => row.apto === "sim").length;
  console.log(`Total de peças: ${rows.length} (aptas: ${aptos}, inaptas: ${rows.length - aptos})`);
  console.log(`CSV gravado em: ${outputPath}`);
}

main()
  .catch((err) => {
    console.error("Erro:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
