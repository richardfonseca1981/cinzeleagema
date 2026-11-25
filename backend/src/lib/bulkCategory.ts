import type { Prisma, PrismaClient } from "@prisma/client";

// Núcleo da movimentação em lote de categoria/subcategoria — usado por
// PATCH /api/admin/products/bulk-category, POST .../bulk-category/undo e
// pelo script restore:categories (mesma validação/aplicação nos três, nunca
// duplicada). Destino é POR PEÇA (heterogêneo) de propósito: "mover N peças
// para a mesma categoria" é só o caso mais comum, expandido pelo chamador
// antes de chegar aqui.

export interface BulkCategoryItemInput {
  id: string;
  categoryId: string | null;
  subcategoryId: string | null;
}

export interface BulkCategorySnapshot {
  id: string;
  categoryId: string | null;
  subcategoryId: string | null;
}

export interface BulkCategoryValidationError {
  index: number;
  id: string;
  reason: string;
}

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

// Só leitura — pode rodar fora de transação (ver rota, que valida antes de
// abrir a transação de escrita). Checa: categoria informada existe;
// subcategoria informada existe E pertence à categoria informada (mesma
// regra de resolveSubcategoryId em product.routes.ts, só que em lote).
export async function validateBulkCategoryItems(
  client: PrismaOrTx,
  items: BulkCategoryItemInput[]
): Promise<BulkCategoryValidationError[]> {
  const categoryIds = [...new Set(items.map((i) => i.categoryId).filter((id): id is string => id !== null))];
  const subcategoryIds = [...new Set(items.map((i) => i.subcategoryId).filter((id): id is string => id !== null))];

  const [categories, subcategories] = await Promise.all([
    categoryIds.length > 0 ? client.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true } }) : [],
    subcategoryIds.length > 0
      ? client.subcategory.findMany({ where: { id: { in: subcategoryIds } }, select: { id: true, categoryId: true } })
      : [],
  ]);

  const existingCategoryIds = new Set(categories.map((c) => c.id));
  const subcategoryById = new Map(subcategories.map((s) => [s.id, s]));

  const errors: BulkCategoryValidationError[] = [];
  items.forEach((item, index) => {
    if (item.categoryId !== null && !existingCategoryIds.has(item.categoryId)) {
      errors.push({ index, id: item.id, reason: "categoria inexistente" });
      return;
    }
    if (item.subcategoryId !== null) {
      const sub = subcategoryById.get(item.subcategoryId);
      if (!sub) {
        errors.push({ index, id: item.id, reason: "subcategoria inexistente" });
        return;
      }
      if (sub.categoryId !== item.categoryId) {
        errors.push({ index, id: item.id, reason: "subcategoria não pertence à categoria informada" });
      }
    }
  });

  return errors;
}

// Aplica o destino de cada item — chamador garante que `client` já validou
// (validateBulkCategoryItems) E está numa transação quando a gravação do
// AdminActionLog precisa fazer parte da mesma operação atômica. Ids que não
// existem mais (peça apagada entre a validação e a aplicação, ou vindo de um
// CSV desatualizado no restore) são ignorados — nunca falha o lote inteiro
// por isso, mesmo princípio de "ids desconhecidos são ignorados" já usado em
// productOrder.routes.ts.
export async function applyBulkCategoryItems(
  client: PrismaOrTx,
  items: BulkCategoryItemInput[]
): Promise<{ before: BulkCategorySnapshot[]; after: BulkCategorySnapshot[]; skippedIds: string[] }> {
  const ids = items.map((i) => i.id);
  const existing = await client.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, categoryId: true, subcategoryId: true },
  });
  const existingById = new Map(existing.map((p) => [p.id, p]));

  const applicable = items.filter((item) => existingById.has(item.id));
  const skippedIds = items.filter((item) => !existingById.has(item.id)).map((item) => item.id);

  const before: BulkCategorySnapshot[] = applicable.map((item) => {
    const current = existingById.get(item.id)!;
    return { id: item.id, categoryId: current.categoryId, subcategoryId: current.subcategoryId };
  });

  for (const item of applicable) {
    await client.product.update({
      where: { id: item.id },
      data: { categoryId: item.categoryId, subcategoryId: item.subcategoryId },
    });
  }

  const after: BulkCategorySnapshot[] = applicable.map((item) => ({
    id: item.id,
    categoryId: item.categoryId,
    subcategoryId: item.subcategoryId,
  }));

  return { before, after, skippedIds };
}
