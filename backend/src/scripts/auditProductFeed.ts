import { prisma } from "../lib/prisma";
import { evaluateFeedEligibility, type FeedExclusionReason } from "../lib/feed/feedEligibility";

// Script SOMENTE LEITURA — não altera nenhuma peça. Roda a mesma regra do
// feed real (evaluateFeedEligibility) contra o banco e imprime quantas
// peças entram, quantas ficam de fora e por qual motivo — útil para
// conferir o feed antes/depois do deploy sem precisar abrir o XML inteiro.

const REASON_LABEL: Record<FeedExclusionReason, string> = {
  inactive: "inativa",
  out_of_stock: "estoque zerado",
  placeholder_title: "nome placeholder/sem nome",
  missing_price: "sem preço (ou preço provisório ≤ R$ 1,00)",
  missing_image: "sem foto",
};

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      nameEn: true,
      description: true,
      descriptionEn: true,
      identificationPt: true,
      identificationEn: true,
      price: true,
      active: true,
      trackStock: true,
      stockQty: true,
      images: { select: { url: true } },
    },
  });

  const counts: Record<FeedExclusionReason, number> = {
    inactive: 0,
    out_of_stock: 0,
    placeholder_title: 0,
    missing_price: 0,
    missing_image: 0,
  };
  const examples: Record<FeedExclusionReason, string[]> = {
    inactive: [],
    out_of_stock: [],
    placeholder_title: [],
    missing_price: [],
    missing_image: [],
  };

  let eligible = 0;
  for (const product of products) {
    const result = evaluateFeedEligibility(product);
    if (result.eligible) {
      eligible++;
      continue;
    }
    const reason = result.reason as FeedExclusionReason;
    counts[reason]++;
    if (examples[reason].length < 5) {
      examples[reason].push(`id=${product.id} sku=${product.sku ?? "(sem sku)"} name=${JSON.stringify(product.name)}`);
    }
  }

  console.log(`Total de peças no banco: ${products.length}`);
  console.log(`Entram no feed: ${eligible}`);
  console.log(`Fora do feed: ${products.length - eligible}\n`);

  for (const reason of Object.keys(counts) as FeedExclusionReason[]) {
    console.log(`  ${REASON_LABEL[reason]}: ${counts[reason]}`);
    for (const example of examples[reason]) {
      console.log(`    - ${example}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
