import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { createProductSchema, listProductsQuerySchema, updateProductSchema } from "../schemas/product.schema";

export const productRouter = Router();

productRouter.use(requireAuth);

// Valida que a categoria existe e que a subcategoria (quando informada ou
// exigida) pertence a ela. Retorna o subcategoryId final a ser persistido
// (null quando a categoria não tem subcategorias).
async function resolveSubcategoryId(categoryId: string, subcategoryId: string | null | undefined) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { subcategories: true },
  });
  if (!category) throw new HttpError(400, "Categoria inválida");

  if (category.subcategories.length === 0) {
    return null;
  }

  if (!subcategoryId) {
    throw new HttpError(400, "Subcategoria é obrigatória para esta categoria");
  }
  if (!category.subcategories.some((s) => s.id === subcategoryId)) {
    throw new HttpError(400, "Subcategoria inválida para a categoria selecionada");
  }
  return subcategoryId;
}

productRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { active, categoryId, subcategoryId, page, pageSize } = listProductsQuerySchema.parse(req.query);

    const where = {
      ...(active === undefined ? {} : { active }),
      ...(categoryId ? { categoryId } : {}),
      ...(subcategoryId ? { subcategoryId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { images: { orderBy: { position: "asc" } }, category: true, subcategory: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ items, total, page, pageSize });
  })
);

productRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { images: { orderBy: { position: "asc" } }, category: true, subcategory: true },
    });
    if (!product) throw new HttpError(404, "Produto não encontrado");
    res.json(product);
  })
);

productRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createProductSchema.parse(req.body);

    if (!data.trackStock) {
      data.stockQty = null;
    }
    data.subcategoryId = await resolveSubcategoryId(data.categoryId, data.subcategoryId);

    const product = await prisma.product.create({
      data,
      include: { images: true, category: true, subcategory: true },
    });
    res.status(201).json(product);
  })
);

productRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateProductSchema.parse(req.body);

    if (data.trackStock === false) {
      data.stockQty = null;
    }

    if (data.categoryId !== undefined || data.subcategoryId !== undefined) {
      const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new HttpError(404, "Produto não encontrado");

      const categoryId = data.categoryId ?? existing.categoryId;
      const subcategoryId = data.subcategoryId !== undefined ? data.subcategoryId : existing.subcategoryId;
      data.subcategoryId = await resolveSubcategoryId(categoryId, subcategoryId);
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
      include: { images: { orderBy: { position: "asc" } }, category: true, subcategory: true },
    });
    res.json(product);
  })
);

productRouter.patch(
  "/:id/deactivate",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json(product);
  })
);

productRouter.patch(
  "/:id/activate",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { active: true },
    });
    res.json(product);
  })
);
