import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { createProductSchema, listProductsQuerySchema, updateProductSchema } from "../schemas/product.schema";

export const productRouter = Router();

productRouter.use(requireAuth);

productRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { categoryId, active, page, pageSize } = listProductsQuerySchema.parse(req.query);

    const where = {
      ...(categoryId ? { categoryId } : {}),
      ...(active === undefined ? {} : { active }),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true, images: { orderBy: { position: "asc" } } },
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
      include: { category: true, images: { orderBy: { position: "asc" } } },
    });
    if (!product) throw new HttpError(404, "Produto não encontrado");
    res.json(product);
  })
);

productRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createProductSchema.parse(req.body);

    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new HttpError(400, "Categoria inválida");

    if (!data.trackStock) {
      data.stockQty = null;
    }

    const product = await prisma.product.create({
      data: { ...data, attributes: data.attributes as Prisma.InputJsonValue },
      include: { category: true, images: true },
    });
    res.status(201).json(product);
  })
);

productRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateProductSchema.parse(req.body);

    if (data.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
      if (!category) throw new HttpError(400, "Categoria inválida");
    }

    if (data.trackStock === false) {
      data.stockQty = null;
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...data,
        attributes: data.attributes !== undefined ? (data.attributes as Prisma.InputJsonValue) : undefined,
      },
      include: { category: true, images: { orderBy: { position: "asc" } } },
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
