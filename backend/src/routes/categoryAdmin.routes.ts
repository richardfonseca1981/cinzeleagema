import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { recordAdminAction, type AdminActor } from "../lib/adminActionLog";
import { generateUniqueCategorySlug, generateUniqueSubcategorySlug } from "../lib/categorySlug";
import {
  createCategorySchema,
  createSubcategorySchema,
  deleteCategorySchema,
  deleteSubcategorySchema,
  renameCategorySchema,
  renameSubcategorySchema,
} from "../schemas/category.schema";

// Tudo aqui exige admin autenticado (requireAuth em TODAS as rotas) — a rota
// pública GET /api/categories (category.routes.ts) continua como está, só
// leitura, sem contagem de peças.
export const categoryAdminRouter = Router();

function actorFrom(req: { admin?: { sub: string; username: string } }): AdminActor {
  // requireAuth já garante req.admin preenchido antes de chegar aqui.
  return { id: req.admin!.sub, username: req.admin!.username };
}

// Árvore com contagem de peças (ver catalogJob.routes.ts GET /options, mesmo
// padrão de `_count`) + nó sintético "Sem categoria" — só para a tela de
// categorização do admin, nunca consumida pelo site público.
categoryAdminRouter.get(
  "/tree",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        position: true,
        _count: { select: { products: true } },
        subcategories: {
          orderBy: { position: "asc" },
          select: { id: true, name: true, slug: true, position: true, _count: { select: { products: true } } },
        },
      },
    });

    const uncategorizedCount = await prisma.product.count({ where: { categoryId: null } });

    res.json({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        position: c.position,
        productCount: c._count.products,
        subcategories: c.subcategories.map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          position: s.position,
          productCount: s._count.products,
        })),
      })),
      uncategorized: { productCount: uncategorizedCount },
    });
  })
);

categoryAdminRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name } = createCategorySchema.parse(req.body);
    const slug = await generateUniqueCategorySlug(name);
    const { _max } = await prisma.category.aggregate({ _max: { position: true } });
    const position = (_max.position ?? -1) + 1;

    const category = await prisma.category.create({ data: { name, slug, position } });
    await recordAdminAction(prisma, actorFrom(req), "category_create", { id: category.id, name, slug });

    res.status(201).json({ ...category, productCount: 0, subcategories: [] });
  })
);

// Renomear NUNCA recalcula o slug (ver lib/categorySlug.ts) — é a chave do
// mapeamento do feed (googleProductCategoryMap.ts, custom_label_0).
categoryAdminRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name } = renameCategorySchema.parse(req.body);
    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Categoria não encontrada");

    const category = await prisma.category.update({ where: { id: existing.id }, data: { name } });
    await recordAdminAction(prisma, actorFrom(req), "category_rename", {
      id: category.id,
      previousName: existing.name,
      name,
    });

    res.json(category);
  })
);

// Apagar categoria: bloqueado (409, com a contagem exata) se houver peça
// vinculada — `categoryId` de um produto já cobre peças DENTRO de qualquer
// subcategoria desta categoria também (invariante mantida por
// resolveSubcategoryId em product.routes.ts: toda peça com subcategoryId
// tem o categoryId do pai) — não precisa somar as duas contagens.
// `moveAffectedToUncategorized: true` confirma mover as peças para "Sem
// categoria" (categoryId E subcategoryId -> null, já que as subcategorias
// desta categoria são apagadas em cascata no banco) e apagar, no mesmo passo.
categoryAdminRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { moveAffectedToUncategorized } = deleteCategorySchema.parse(req.body ?? {});
    const category = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!category) throw new HttpError(404, "Categoria não encontrada");

    const productCount = await prisma.product.count({ where: { categoryId: category.id } });

    if (productCount > 0 && !moveAffectedToUncategorized) {
      res.status(409).json({
        error: `Esta categoria tem ${productCount} peça(s). Mova as peças antes de apagar, ou confirme mover para "Sem categoria" e apagar.`,
        productCount,
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const affected = await tx.product.findMany({
        where: { categoryId: category.id },
        select: { id: true, categoryId: true, subcategoryId: true },
      });

      if (affected.length > 0) {
        await tx.product.updateMany({ where: { categoryId: category.id }, data: { categoryId: null, subcategoryId: null } });
      }

      await recordAdminAction(tx, actorFrom(req), "category_delete", {
        id: category.id,
        name: category.name,
        slug: category.slug,
        movedProducts: affected, // estado ANTERIOR de cada peça afetada (antes de virar null)
      });

      // Apaga a categoria — ON DELETE CASCADE já remove as subcategorias dela.
      await tx.category.delete({ where: { id: category.id } });
    });

    res.json({ deleted: true, productsMoved: productCount });
  })
);

categoryAdminRouter.post(
  "/:id/subcategories",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name } = createSubcategorySchema.parse(req.body);
    const category = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!category) throw new HttpError(400, "Categoria inválida");

    const slug = await generateUniqueSubcategorySlug(name);
    const { _max } = await prisma.subcategory.aggregate({ _max: { position: true }, where: { categoryId: category.id } });
    const position = (_max.position ?? -1) + 1;

    const subcategory = await prisma.subcategory.create({ data: { name, slug, position, categoryId: category.id } });
    await recordAdminAction(prisma, actorFrom(req), "subcategory_create", {
      id: subcategory.id,
      name,
      slug,
      categoryId: category.id,
    });

    res.status(201).json({ ...subcategory, productCount: 0 });
  })
);

categoryAdminRouter.patch(
  "/subcategories/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name } = renameSubcategorySchema.parse(req.body);
    const existing = await prisma.subcategory.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Subcategoria não encontrada");

    const subcategory = await prisma.subcategory.update({ where: { id: existing.id }, data: { name } });
    await recordAdminAction(prisma, actorFrom(req), "subcategory_rename", {
      id: subcategory.id,
      previousName: existing.name,
      name,
    });

    res.json(subcategory);
  })
);

// Apagar SUBCATEGORIA (diferente de apagar a categoria toda): peça afetada
// perde só a subcategoria — `categoryId` NUNCA é tocado aqui, a peça
// continua na categoria-mãe, só sem subcategoria específica. "Mover para Sem
// categoria" nesta rota significa "sem SUBcategoria", não sem categoria.
categoryAdminRouter.delete(
  "/subcategories/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { moveAffectedToUncategorized } = deleteSubcategorySchema.parse(req.body ?? {});
    const subcategory = await prisma.subcategory.findUnique({ where: { id: req.params.id } });
    if (!subcategory) throw new HttpError(404, "Subcategoria não encontrada");

    const productCount = await prisma.product.count({ where: { subcategoryId: subcategory.id } });

    if (productCount > 0 && !moveAffectedToUncategorized) {
      res.status(409).json({
        error: `Esta subcategoria tem ${productCount} peça(s). Mova as peças antes de apagar, ou confirme remover a subcategoria delas e apagar.`,
        productCount,
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const affected = await tx.product.findMany({
        where: { subcategoryId: subcategory.id },
        select: { id: true, categoryId: true, subcategoryId: true },
      });

      if (affected.length > 0) {
        await tx.product.updateMany({ where: { subcategoryId: subcategory.id }, data: { subcategoryId: null } });
      }

      await recordAdminAction(tx, actorFrom(req), "subcategory_delete", {
        id: subcategory.id,
        name: subcategory.name,
        slug: subcategory.slug,
        categoryId: subcategory.categoryId,
        movedProducts: affected,
      });

      await tx.subcategory.delete({ where: { id: subcategory.id } });
    });

    res.json({ deleted: true, productsMoved: productCount });
  })
);
