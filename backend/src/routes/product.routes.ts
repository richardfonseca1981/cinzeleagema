import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { createProductSchema, listProductsQuerySchema, updateProductSchema } from "../schemas/product.schema";
import { escapeLikePattern } from "../utils/escapeLike";
import { translateAndSaveProduct, translateProductInBackground } from "../lib/productTranslation";

export const productRouter = Router();

// GET fica público: alimenta o catálogo do site (navegação/filtro por
// categoria e página de detalhe). Só as rotas que alteram dados exigem login.

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
    const { active, categoryId, subcategoryId, q, page, pageSize } = listProductsQuerySchema.parse(req.query);

    const where = {
      ...(active === undefined ? {} : { active }),
      ...(categoryId ? { categoryId } : {}),
      ...(subcategoryId ? { subcategoryId } : {}),
      // O total (count) usa o mesmo "where": páginas e total refletem a busca.
      ...(q
        ? {
            OR: [
              { name: { contains: escapeLikePattern(q), mode: "insensitive" as const } },
              { sku: { contains: escapeLikePattern(q), mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { images: { orderBy: { position: "asc" } }, category: true, subcategory: true },
        // "id" como desempate: dois produtos com o mesmo createdAt (ex:
        // seed em lote) teriam ordem indefinida entre si só com createdAt,
        // o que pode pular ou repetir peças ao paginar (uma mesma posição
        // "na borda" entre duas páginas ora aparece numa, ora na outra).
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
  requireAuth,
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

    // Produto novo: sempre traduz. Não bloqueia a resposta nem falha o
    // cadastro se a tradução der errado (ver translateProductInBackground).
    translateProductInBackground(product.id, product.name, product.description);
  })
);

productRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = updateProductSchema.parse(req.body);

    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Produto não encontrado");

    if (data.trackStock === false) {
      data.stockQty = null;
    }

    if (data.categoryId !== undefined || data.subcategoryId !== undefined) {
      const categoryId = data.categoryId ?? existing.categoryId;
      const subcategoryId = data.subcategoryId !== undefined ? data.subcategoryId : existing.subcategoryId;
      data.subcategoryId = await resolveSubcategoryId(categoryId, subcategoryId);
    }

    const nameChanged = data.name !== undefined && data.name !== existing.name;
    const descriptionChanged = data.description !== undefined && data.description !== existing.description;

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
      include: { images: { orderBy: { position: "asc" } }, category: true, subcategory: true },
    });
    res.json(product);

    // Só retraduz quando nome ou descrição de fato mudaram — evita chamar a
    // IA à toa em edições que não tocam nesses campos (ex: só preço).
    if (nameChanged || descriptionChanged) {
      translateProductInBackground(product.id, product.name, product.description);
    }
  })
);

productRouter.post(
  "/:id/retranslate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw new HttpError(404, "Produto não encontrado");

    const updated = await translateAndSaveProduct(product.id, product.name, product.description);
    if (!updated) throw new HttpError(502, "Não foi possível traduzir o produto agora, tente novamente");

    res.json(updated);
  })
);

productRouter.patch(
  "/:id/deactivate",
  requireAuth,
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
  requireAuth,
  asyncHandler(async (req, res) => {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { active: true },
    });
    res.json(product);
  })
);
