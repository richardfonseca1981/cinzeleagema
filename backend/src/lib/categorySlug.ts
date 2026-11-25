import { slugify } from "./productSlug";
import { prisma } from "./prisma";

// Mesmo algoritmo de slugify dos produtos (productSlug.ts) — reaproveitado
// aqui, nunca duplicado. Slug gerado só na CRIAÇÃO e NUNCA recalculado ao
// renomear (mesma decisão de Product.slug): é a chave usada pelo feed de
// produtos (lib/feed/googleProductCategoryMap.ts, custom_label_0) — se o
// slug mudasse ao renomear, o mapeamento do Google Merchant quebraria
// silenciosamente.
export async function generateUniqueCategorySlug(name: string): Promise<string> {
  const base = slugify(name.trim()) || "categoria";
  let candidate = base;
  let suffix = 2;
  while (await prisma.category.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function generateUniqueSubcategorySlug(name: string): Promise<string> {
  const base = slugify(name.trim()) || "subcategoria";
  let candidate = base;
  let suffix = 2;
  while (await prisma.subcategory.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
