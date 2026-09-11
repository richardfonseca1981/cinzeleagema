import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { confirmImageSchema, presignImageSchema, reorderImagesSchema } from "../schemas/product.schema";
import { createPresignedUpload, deleteObject, isR2Configured } from "../lib/r2";

export const imageRouter = Router({ mergeParams: true });

imageRouter.use(requireAuth);

async function ensureProductExists(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new HttpError(404, "Produto não encontrado");
  return product;
}

// Passo 1: gera uma URL assinada para o frontend enviar o arquivo direto ao R2
imageRouter.post(
  "/presign",
  asyncHandler(async (req, res) => {
    const { productId } = req.params as { productId: string };
    await ensureProductExists(productId);

    if (!isR2Configured()) {
      throw new HttpError(503, "Upload de imagens não configurado (variáveis R2 ausentes)");
    }

    const { fileName, contentType } = presignImageSchema.parse(req.body);
    const presigned = await createPresignedUpload(productId, fileName, contentType);
    res.json(presigned);
  })
);

// Passo 2: depois do upload direto ao R2 ter sucesso, o frontend confirma
// criando o registro ProductImage com a posição seguinte disponível
imageRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { productId } = req.params as { productId: string };
    await ensureProductExists(productId);

    const { url, key } = confirmImageSchema.parse(req.body);

    const lastImage = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: { position: "desc" },
    });

    const image = await prisma.productImage.create({
      data: { productId, url, key, position: (lastImage?.position ?? -1) + 1 },
    });

    res.status(201).json(image);
  })
);

imageRouter.patch(
  "/reorder",
  asyncHandler(async (req, res) => {
    const { productId } = req.params as { productId: string };
    await ensureProductExists(productId);

    const { order } = reorderImagesSchema.parse(req.body);

    const existing = await prisma.productImage.findMany({
      where: { productId, id: { in: order } },
      select: { id: true },
    });
    if (existing.length !== order.length) {
      throw new HttpError(400, "Lista de imagens inválida para este produto");
    }

    await prisma.$transaction(
      order.map((imageId, index) =>
        prisma.productImage.update({
          where: { id: imageId },
          data: { position: index },
        })
      )
    );

    const images = await prisma.productImage.findMany({
      where: { productId },
      orderBy: { position: "asc" },
    });
    res.json(images);
  })
);

imageRouter.delete(
  "/:imageId",
  asyncHandler(async (req, res) => {
    const { productId, imageId } = req.params as { productId: string; imageId: string };
    await ensureProductExists(productId);

    const image = await prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image || image.productId !== productId) {
      throw new HttpError(404, "Imagem não encontrada");
    }

    if (isR2Configured()) {
      await deleteObject(image.key);
    }
    await prisma.productImage.delete({ where: { id: imageId } });

    res.status(204).send();
  })
);
