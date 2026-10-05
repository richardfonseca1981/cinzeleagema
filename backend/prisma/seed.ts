import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runSeed } from "./seedData";

const prisma = new PrismaClient();

// Só executa o seed (dados e lógica em ./seedData.ts, testados).
// ⚠️ Produção: NÃO use o seed para migrar dados — ver promoteFormasToCategory.
runSeed(prisma)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
