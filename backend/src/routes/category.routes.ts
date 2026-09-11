import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { createCategorySchema, updateCategorySchema } from "../schemas/category.schema";

export const categoryRouter = Router();

categoryRouter.use(requireAuth);

categoryRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
    });
    res.json(categories);
  })
);

categoryRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createCategorySchema.parse(req.body);
    const category = await prisma.category.create({ data });
    res.status(201).json(category);
  })
);

categoryRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateCategorySchema.parse(req.body);
    const category = await prisma.category.update({ where: { id: req.params.id }, data });
    res.json(category);
  })
);
