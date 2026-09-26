import { Router } from "express";
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
    const { active, page, pageSize } = listProductsQuerySchema.parse(req.query);

    const where = {
      ...(active === undefined ? {} : { active }),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { images: { orderBy: { position: "asc" } } },
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
      include: { images: { orderBy: { position: "asc" } } },
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

    const product = await prisma.product.create({
      data,
      include: { images: true },
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

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
      include: { images: { orderBy: { position: "asc" } } },
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
