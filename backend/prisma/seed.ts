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

  const esmeralda = await prisma.category.upsert({
    where: { slug: "esmeralda" },
    update: {},
    create: {
      name: "Esmeralda",
      slug: "esmeralda",
      attributeSchema: [
        { key: "carat", label: "Quilate", type: "number" },
        {
          key: "cut",
          label: "Corte",
          type: "select",
          options: ["Oval", "Redondo", "Esmeralda", "Pera", "Cushion"],
        },
        { key: "origin", label: "Origem", type: "text" },
        {
          key: "clarity",
          label: "Claridade",
          type: "select",
          options: ["FL", "IF", "VVS", "VS", "SI", "I"],
        },
        { key: "certificate", label: "Certificado/laudo gemológico", type: "text" },
      ],
    },
  });

  const ametista = await prisma.category.upsert({
    where: { slug: "ametista" },
    update: {},
    create: {
      name: "Ametista",
      slug: "ametista",
      attributeSchema: [
        { key: "carat", label: "Quilate", type: "number" },
        { key: "cut", label: "Corte", type: "select", options: ["Oval", "Redondo", "Pera", "Cushion"] },
        { key: "origin", label: "Origem", type: "text" },
        { key: "color", label: "Cor", type: "text" },
      ],
    },
  });

  const topazio = await prisma.category.upsert({
    where: { slug: "topazio" },
    update: {},
    create: {
      name: "Topázio",
      slug: "topazio",
      attributeSchema: [
        { key: "carat", label: "Quilate", type: "number" },
        { key: "color", label: "Cor", type: "text" },
        { key: "origin", label: "Origem", type: "text" },
        { key: "certificate", label: "Certificado/laudo gemológico", type: "text" },
      ],
    },
  });

  await prisma.product.upsert({
    where: { slug: "esmeralda-colombiana-2-3ct" },
    update: {},
    create: {
      name: "Esmeralda Colombiana 2.3ct",
      slug: "esmeralda-colombiana-2-3ct",
      description: "Peça única, esmeralda colombiana lapidada em corte esmeralda, com laudo gemológico.",
      categoryId: esmeralda.id,
      price: 8500.0,
      sku: "ESM-COL-001",
      trackStock: false,
      attributes: {
        carat: 2.3,
        cut: "Esmeralda",
        origin: "Colômbia",
        clarity: "VS",
        certificate: "GIA 2201234567",
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: "ametista-uruguaia-5ct" },
    update: {},
    create: {
      name: "Ametista Uruguaia 5ct",
      slug: "ametista-uruguaia-5ct",
      description: "Peça única, ametista de tonalidade profunda, lapidação oval.",
      categoryId: ametista.id,
      price: 620.0,
      sku: "AME-URU-001",
      trackStock: false,
      attributes: { carat: 5, cut: "Oval", origin: "Uruguai", color: "Roxo profundo" },
    },
  });

  await prisma.product.upsert({
    where: { slug: "topazio-imperial-3-1ct" },
    update: {},
    create: {
      name: "Topázio Imperial 3.1ct",
      slug: "topazio-imperial-3-1ct",
      description: "Peça única, topázio imperial de Ouro Preto, com laudo gemológico.",
      categoryId: topazio.id,
      price: 4200.0,
      sku: "TOP-IMP-001",
      trackStock: false,
      attributes: {
        carat: 3.1,
        color: "Laranja-rosado",
        origin: "Ouro Preto, MG",
        certificate: "IBGM 887654",
      },
    },
  });

  console.log("Categorias e produtos de exemplo criados.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
