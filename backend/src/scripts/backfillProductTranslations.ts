import "dotenv/config";
import { prisma } from "../lib/prisma";
import { translateAndSaveProduct } from "../lib/productTranslation";

// Roda uma vez (via `npm run translate:backfill -w backend`) para preencher
// nameEn/descriptionEn dos produtos cadastrados antes da tradução automática
// existir. Produtos novos já são traduzidos sozinhos ao serem criados.
async function main() {
  const products = await prisma.product.findMany({
    where: { nameEn: null },
    select: { id: true, name: true, description: true },
  });

  console.log(`${products.length} produto(s) sem tradução encontrados.`);

  let translated = 0;
  let failed = 0;

  for (const product of products) {
    const updated = await translateAndSaveProduct(product.id, product.name, product.description);
    if (updated) {
      translated++;
      console.log(`✓ ${product.name} -> ${updated.nameEn}`);
    } else {
      failed++;
      console.warn(`✗ Falha ao traduzir "${product.name}" (id ${product.id})`);
    }
  }

  console.log(`Concluído: ${translated} traduzido(s), ${failed} falha(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
