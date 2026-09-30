import "dotenv/config";
import { prisma } from "../lib/prisma";
import { translateAndSaveProduct } from "../lib/productTranslation";
import { isValidTranslation } from "../lib/claude";

// Varre todos os produtos em busca de nameEn/descriptionEn com marcadores de
// erro/placeholder salvos por engano (bug corrigido em claude.ts — ver
// isValidTranslation) e tenta retraduzir cada um. Rodar uma vez após o
// deploy da correção para saneiar produtos já cadastrados; ex:
// railway run node dist/scripts/fixInvalidTranslations.js
async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, description: true, nameEn: true, descriptionEn: true },
  });

  const suspicious = products.filter((p) => {
    const badName = p.nameEn !== null && !isValidTranslation(p.nameEn);
    const badDescription = p.descriptionEn !== null && !isValidTranslation(p.descriptionEn);
    return badName || badDescription;
  });

  console.log(`${products.length} produto(s) no total. ${suspicious.length} com tradução suspeita.`);
  for (const p of suspicious) {
    console.log(`  - [${p.id}] "${p.name}" -> nameEn=${JSON.stringify(p.nameEn)} descriptionEn=${JSON.stringify(p.descriptionEn)}`);
  }

  if (suspicious.length === 0) {
    console.log("Nada para corrigir.");
    return;
  }

  console.log("\nRetraduzindo...");
  let fixed = 0;
  let stillInvalid = 0;

  for (const p of suspicious) {
    const updated = await translateAndSaveProduct(p.id, p.name, p.description);
    const ok = updated && isValidTranslation(updated.nameEn) && (updated.descriptionEn === null || isValidTranslation(updated.descriptionEn));

    if (ok) {
      fixed++;
      console.log(`  ✓ [${p.id}] "${p.name}" -> nameEn=${JSON.stringify(updated.nameEn)} descriptionEn=${JSON.stringify(updated.descriptionEn)}`);
    } else {
      stillInvalid++;
      console.warn(`  ✗ [${p.id}] "${p.name}" continua sem tradução válida — verifique manualmente (pode exigir ajustar a descrição em PT).`);
    }
  }

  console.log(`\nConcluído: ${fixed} corrigido(s), ${stillInvalid} ainda sem tradução válida.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
