import { randomUUID } from "crypto";
import { prisma } from "./prisma";

const DIACRITICS_REGEX = /[̀-ͯ]/g;

// Mesmo algoritmo do slugify do frontend (ProductForm.tsx) — mantém o
// comportamento idêntico ao que o admin via acontecer antes do slug virar
// 100% gerado no backend.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Base do slug: a partir do nome quando houver um nome utilizável; senão, um
// identificador novo (não é o id do registro — evita depender da ordem de
// criação — mas serve ao mesmo propósito: algo estável e exclusivo para a
// peça sem nome).
export function baseSlugFor(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) {
    const slug = slugify(trimmed);
    if (slug) return slug;
  }
  return `peca-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

// Garante unicidade: tenta a base; se já existir, tenta "-2", "-3"... Produto
// nunca reutiliza o slug de outro (mesmo entre uma peça excluída e outra nova
// com o mesmo nome, já que slug é só @unique, não reaproveitado).
export async function generateUniqueSlug(name: string | null | undefined): Promise<string> {
  const base = baseSlugFor(name);
  let candidate = base;
  let suffix = 2;
  // Produto é uma tabela pequena (peças de joalheria, não milhões de linhas);
  // uma peça por vez no cadastro torna essa consulta sequencial aceitável.
  while (await prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
