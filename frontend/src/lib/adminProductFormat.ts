// Formatação específica da listagem do admin — separada de lib/format.ts
// (compartilhado com o catálogo público) porque aqui peso e tamanho viram
// colunas independentes, cada uma com seu próprio "—" quando ausente.
// Mesma convenção já usada no site público: 0 é o sentinel de "ausente" (ver
// schema.prisma, weightGrams/sizeCm) — não é um peso/tamanho real.

const DASH = "—";

export function formatAdminWeight(weightGrams: string | number): string {
  const grams = Number(weightGrams);
  if (!(grams > 0)) return DASH;
  if (grams >= 1000) {
    return `${(grams / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}kg`;
  }
  return `${grams.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}g`;
}

export function formatAdminSize(sizeCm: string | number): string {
  const cm = Number(sizeCm);
  if (!(cm > 0)) return DASH;
  return `${cm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}cm`;
}

export function formatAdminPrice(price: string | number | null): string {
  if (price === null) return "Consulte o valor";
  return Number(price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatAdminSku(sku: string | null): string {
  return sku && sku.trim() ? sku : DASH;
}
