import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { buildCategoryExportCsv } from "../lib/categoryExportCsv";

// Montado em /api/admin/products — requireAuth.
export const productCategoryExportRouter = Router();

productCategoryExportRouter.get(
  "/category-export.csv",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const products = await prisma.product.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, sku: true, name: true, category: { select: { name: true } }, subcategory: { select: { name: true } } },
    });

    const csv = buildCategoryExportCsv(
      products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        categoryName: p.category?.name ?? null,
        subcategoryName: p.subcategory?.name ?? null,
      }))
    );

    res.set("Content-Disposition", 'attachment; filename="categorizacao.csv"');
    res.type("text/csv; charset=utf-8").send(csv);
  })
);
