import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminUsername = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@site-pedras-preciosas.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.adminUser.upsert({
    where: { username: adminUsername },
    update: {},
    create: { username: adminUsername, email: adminEmail, passwordHash, role: "admin" },
  });
  console.log(`Admin criado/existente: ${adminUsername} (senha padrão: ${adminPassword})`);

  await prisma.product.upsert({
    where: { slug: "esmeralda-colombiana-2-3ct" },
    update: { weightGrams: 0.46, sizeCm: 0.9 },
    create: {
      name: "Esmeralda Colombiana 2.3ct",
      slug: "esmeralda-colombiana-2-3ct",
      description: "Peça única, esmeralda colombiana lapidada em corte esmeralda, com laudo gemológico.",
      price: 8500.0,
      sku: "ESM-COL-001",
      trackStock: false,
      weightGrams: 0.46,
      sizeCm: 0.9,
    },
  });

  await prisma.product.upsert({
    where: { slug: "ametista-uruguaia-5ct" },
    update: { weightGrams: 1.0, sizeCm: 1.3 },
    create: {
      name: "Ametista Uruguaia 5ct",
      slug: "ametista-uruguaia-5ct",
      description: "Peça única, ametista de tonalidade profunda, lapidação oval.",
      price: 620.0,
      sku: "AME-URU-001",
      trackStock: false,
      weightGrams: 1.0,
      sizeCm: 1.3,
    },
  });

  await prisma.product.upsert({
    where: { slug: "topazio-imperial-3-1ct" },
    update: { weightGrams: 0.62, sizeCm: 1.1 },
    create: {
      name: "Topázio Imperial 3.1ct",
      slug: "topazio-imperial-3-1ct",
      description: "Peça única, topázio imperial de Ouro Preto, com laudo gemológico.",
      price: 4200.0,
      sku: "TOP-IMP-001",
      trackStock: false,
      weightGrams: 0.62,
      sizeCm: 1.1,
    },
  });

  console.log("Produtos de exemplo criados.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
