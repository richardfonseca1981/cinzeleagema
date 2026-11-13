import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { validateListing } from "../lib/mercadoLivre/listingValidator";

// Script SOMENTE LEITURA (Fase 1A) — só faz SELECT (prisma.product.findMany)
// e grava um CSV local; nunca escreve no banco, nunca chama a API do
// Mercado Livre. Uso: `npm run audit:mercadolivre` dentro de backend/ (ou
// `npx tsx src/scripts/auditMercadoLivre.ts`).
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

async function main() {
  console.log(`Banco: ${describeDatabase()} (somente leitura — nenhum SELECT grava nada)`);

  const products = await prisma.product.findMany({
    include: { images: { orderBy: { position: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });

  const rows = products.map((product) => {
    const result = validateListing(product);
    return {
      id: product.id,
      sku: product.sku ?? "",
      nome: product.name ?? "",
      apto: result.eligible ? "sim" : "nao",
      motivos: result.blockers.map((b) => b.code).join("; "),
    };
  });

  const header = ["id", "sku", "nome", "apto", "motivos"] as const;
  const lines = [
    header.join(","),
    ...rows.map((row) => header.map((key) => csvEscape(String(row[key]))).join(",")),
  ];

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
