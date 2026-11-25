import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { bulkCategorySchema } from "../schemas/product.schema";
import { applyBulkCategoryItems, validateBulkCategoryItems, type BulkCategorySnapshot } from "../lib/bulkCategory";
import { getLastAction, recordAdminAction, type AdminActor } from "../lib/adminActionLog";

// Montado em /api/admin/products — requireAuth em todas as rotas.
export const productBulkCategoryRouter = Router();

const BULK_CATEGORY_MOVE_ACTION = "bulk_category_move";
const BULK_CATEGORY_UNDO_ACTION = "bulk_category_undo";

function actorFrom(req: { admin?: { sub: string; username: string } }): AdminActor {
  return { id: req.admin!.sub, username: req.admin!.username };
}

// Validação ANTES de abrir a transação (só leitura, pode rodar fora dela) —
// transação é aberta só para a parte que escreve, menor tempo de lock.
productBulkCategoryRouter.patch(
  "/bulk-category",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { items } = bulkCategorySchema.parse(req.body);

    const errors = await validateBulkCategoryItems(prisma, items);
    if (errors.length > 0) {
      res.status(400).json({ error: "Itens inválidos", details: errors });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const applied = await applyBulkCategoryItems(tx, items);
      await recordAdminAction(tx, actorFrom(req), BULK_CATEGORY_MOVE_ACTION, {
        before: applied.before,
        after: applied.after,
      });
      return applied;
    });

    res.json({ updated: result.before.length, skipped: result.skippedIds.length, skippedIds: result.skippedIds, items: result.after });
  })
);

// Desfaz a ÚLTIMA ação de mover em lote (um nível só, mesmo princípio já
// usado no projeto para desfazer tratamento de foto) — reaplica o "before"
// gravado naquela entrada do log, registrando uma NOVA entrada (nunca edita
// a entrada antiga: o histórico fica íntegro).
productBulkCategoryRouter.post(
  "/bulk-category/undo",
  requireAuth,
  asyncHandler(async (req, res) => {
    const last = await getLastAction(BULK_CATEGORY_MOVE_ACTION);
    if (!last) {
      res.status(404).json({ error: "Nenhuma ação de mover em lote para desfazer" });
      return;
    }

    const payload = last.payload as unknown as { before: BulkCategorySnapshot[] };

    const result = await prisma.$transaction(async (tx) => {
      const applied = await applyBulkCategoryItems(tx, payload.before);
      await recordAdminAction(tx, actorFrom(req), BULK_CATEGORY_UNDO_ACTION, {
        undidActionId: last.id,
        before: applied.before,
        after: applied.after,
      });
      return applied;
    });

    res.json({ updated: result.before.length, skipped: result.skippedIds.length, items: result.after });
  })
);
