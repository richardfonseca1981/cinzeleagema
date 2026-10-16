import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { reorderProductsSchema } from "../schemas/product.schema";

// Ordem das peças no site (definida pelo admin). Montado em
// /api/admin/products, antes de /api/products (sem colisão com "/:id").
export const productOrderRouter = Router();

const listSelect = {
  id: true,
  name: true,
  sku: true,
  active: true,
  sortOrder: true,
  categoryId: true,
  images: { orderBy: { position: "asc" as const }, take: 1, select: { url: true } },
};

// Lista compacta de TODAS as peças (ativas e inativas) na ordem atual.
productOrderRouter.get(
  "/order",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const items = await prisma.product.findMany({
      select: listSelect,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    res.json({ items, total: items.length });
  })
);

// Recebe a lista completa de ids na nova ordem. Ids desconhecidos são
// ignorados; peças que não vieram (criadas durante a edição) vão para o topo
// mantendo a ordem relativa. Tudo numa transação; renormaliza 0..N-1.
productOrderRouter.put(
  "/order",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { order } = reorderProductsSchema.parse(req.body);

    await prisma.$transaction(async (tx) => {
      const current = await tx.product.findMany({
        select: { id: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });
      const known = new Set(current.map((p) => p.id));
      const sent = order.filter((id) => known.has(id));
      const sentSet = new Set(sent);
      const missing = current.filter((p) => !sentSet.has(p.id)).map((p) => p.id);
      const finalOrder = [...missing, ...sent];

      const currentPos = new Map(current.map((p) => [p.id, p.sortOrder]));
      const updates = finalOrder
        .map((id, index) => ({ id, index }))
        .filter(({ id, index }) => currentPos.get(id) !== index);
      for (const { id, index } of updates) {
        await tx.product.update({ where: { id }, data: { sortOrder: index } });
      }
    });

    const items = await prisma.product.findMany({
      select: listSelect,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    res.json({ items, total: items.length });
  })
);
