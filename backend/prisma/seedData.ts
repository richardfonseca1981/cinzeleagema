import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Dados e lógica do seed, separados de prisma/seed.ts (que só executa) para
// poderem ser testados com o banco de teste. Idempotente: tudo é upsert.

// Ordem fixa definida pelo cliente — a posição de cada categoria e de cada
// subcategoria dentro dela vem da ordem dos arrays abaixo (1-based).
export const categoryData: { name: string; slug: string; subcategories?: { name: string; slug: string }[] }[] = [
  {
    name: "Pedras Brutas",
    slug: "pedras-brutas",
    subcategories: [
      { name: "Pedras Brutas Peça", slug: "pedras-brutas-peca" },
      { name: "Capelas de Ametista", slug: "capelas-de-ametista" },
      { name: "Capelas de Citrino", slug: "capelas-de-citrino" },
      { name: "Pedras Exclusivas", slug: "pedras-exclusivas" },
    ],
  },
  {
    name: "Pedras Polidas",
    slug: "pedras-polidas",
    subcategories: [
      { name: "Pedras Roladas", slug: "pedras-roladas" },
      { name: "Pedras Polidas Exclusivas", slug: "pedras-polidas-exclusivas" },
    ],
  },
  {
    name: "Big",
    slug: "big",
    subcategories: [
      { name: "Ametistas", slug: "ametistas" },
      { name: "Calcitas", slug: "calcitas" },
      { name: "Citrinos", slug: "citrinos" },
    ],
  },
  // "Formas" era subcategoria de BIG e virou categoria de nível 1 (sem
  // subcategorias). Produção migra SÓ pelo script promoteFormasToCategory —
  // este seed nunca remove nem move nada, e não recria a subcategoria antiga.
  { name: "Formas", slug: "formas" },
  { name: "Homedecor", slug: "homedecor" },
  { name: "Acessorios", slug: "acessorios" },
];

export async function runSeed(prisma: PrismaClient): Promise<void> {
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

  const categoryIdBySlug = new Map<string, string>();
  const subcategoryIdBySlug = new Map<string, string>();

  for (const [categoryIndex, cat] of categoryData.entries()) {
    const position = categoryIndex + 1;
    const category = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, position },
      create: { name: cat.name, slug: cat.slug, position },
    });
    categoryIdBySlug.set(cat.slug, category.id);

    for (const [subIndex, sub] of (cat.subcategories ?? []).entries()) {
      const subPosition = subIndex + 1;
      const subcategory = await prisma.subcategory.upsert({
        where: { slug: sub.slug },
        update: { name: sub.name, categoryId: category.id, position: subPosition },
        create: { name: sub.name, slug: sub.slug, categoryId: category.id, position: subPosition },
      });
      subcategoryIdBySlug.set(sub.slug, subcategory.id);
    }
  }
  console.log("Categorias e subcategorias criadas/atualizadas.");

  // Banco ainda não migrado: o seed NÃO move produtos nem remove a subcategoria
  // antiga — isso é feito só pelo script (simulação por padrão, reversível).
  const legacyFormas = await prisma.subcategory.findUnique({ where: { slug: "formas" } });
  if (legacyFormas) {
    console.warn(
      'ATENÇÃO: ainda existe a subcategoria antiga "formas" (filha de BIG). Rode `npm run promote-formas` (simulação) e depois `npm run promote-formas -- --apply` para migrar os produtos. O seed não faz essa migração.'
    );
  }

  // Migração de produtos antigos: reatribui quem ficou na categoria
  // temporária criada pela migration e remove essa categoria de placeholder.
  const legacyCategory = await prisma.category.findUnique({ where: { slug: "sem-categoria" } });
  if (legacyCategory) {
    await prisma.product.updateMany({
      where: { categoryId: legacyCategory.id },
      data: { categoryId: categoryIdBySlug.get("homedecor")! },
    });
    await prisma.category.delete({ where: { id: legacyCategory.id } });
  }

  await prisma.product.upsert({
    where: { slug: "esmeralda-colombiana-2-3ct" },
    update: {
      weightGrams: 0.46,
      sizeCm: 0.9,
      categoryId: categoryIdBySlug.get("pedras-polidas")!,
      subcategoryId: subcategoryIdBySlug.get("pedras-polidas-exclusivas")!,
    },
    create: {
      name: "Esmeralda Colombiana 2.3ct",
      slug: "esmeralda-colombiana-2-3ct",
      description: "Peça única, esmeralda colombiana lapidada em corte esmeralda, com laudo gemológico.",
      price: 8500.0,
      sku: "ESM-COL-001",
      trackStock: false,
      weightGrams: 0.46,
      sizeCm: 0.9,
      categoryId: categoryIdBySlug.get("pedras-polidas")!,
      subcategoryId: subcategoryIdBySlug.get("pedras-polidas-exclusivas")!,
    },
  });

  await prisma.product.upsert({
    where: { slug: "ametista-uruguaia-5ct" },
    update: {
      weightGrams: 1.0,
      sizeCm: 1.3,
      categoryId: categoryIdBySlug.get("pedras-brutas")!,
      subcategoryId: subcategoryIdBySlug.get("capelas-de-ametista")!,
    },
    create: {
      name: "Ametista Uruguaia 5ct",
      slug: "ametista-uruguaia-5ct",
      description: "Peça única, ametista de tonalidade profunda, lapidação oval.",
      price: 620.0,
      sku: "AME-URU-001",
      trackStock: false,
      weightGrams: 1.0,
      sizeCm: 1.3,
      categoryId: categoryIdBySlug.get("pedras-brutas")!,
      subcategoryId: subcategoryIdBySlug.get("capelas-de-ametista")!,
    },
  });

  await prisma.product.upsert({
    where: { slug: "topazio-imperial-3-1ct" },
    update: {
      weightGrams: 0.62,
      sizeCm: 1.1,
      categoryId: categoryIdBySlug.get("pedras-brutas")!,
      subcategoryId: subcategoryIdBySlug.get("pedras-exclusivas")!,
    },
    create: {
      name: "Topázio Imperial 3.1ct",
      slug: "topazio-imperial-3-1ct",
      description: "Peça única, topázio imperial de Ouro Preto, com laudo gemológico.",
      price: 4200.0,
      sku: "TOP-IMP-001",
      trackStock: false,
      weightGrams: 0.62,
      sizeCm: 1.1,
      categoryId: categoryIdBySlug.get("pedras-brutas")!,
      subcategoryId: subcategoryIdBySlug.get("pedras-exclusivas")!,
    },
  });

  console.log("Produtos de exemplo criados.");
}
