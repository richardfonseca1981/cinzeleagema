import { randomUUID } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { reorderImagesSchema } from "../schemas/product.schema";
import { isR2Configured, putObject } from "../lib/r2";
import { filesSafeToRemove, removeFiles } from "../lib/photoFiles";
import { MAX_PHOTOS_PER_PRODUCT, normalizeToPortrait, PHOTO_MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE } from "../lib/photoFormat";

export const imageRouter = Router({ mergeParams: true });

imageRouter.use(requireAuth);

async function ensureProductExists(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new HttpError(404, "Produto não encontrado");
  return product;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PHOTO_MAX_UPLOAD_BYTES, files: 1 } });

function receiveFile(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") return next(new HttpError(413, TOO_LARGE_MESSAGE));
    next(err);
  });
}

const uploadFieldsSchema = z.object({
  colorEnhanced: z.enum(["true", "false"]).optional(),
  colorEnhanceLevel: z.enum(["leve", "medio", "forte"]).optional(),
});

// ÚNICO caminho que grava fotos novas no R2: o arquivo passa pelo servidor, é
// colocado no formato final 9:16 (ver lib/photoFormat.ts), sem EXIF/GPS, e só
// então vai ao R2 (sempre com chave NOVA — nunca reaproveita o nome de uma foto
// anterior, por causa de cache) e vira ProductImage.
imageRouter.post(
  "/upload",
  receiveFile,
  asyncHandler(async (req, res) => {
    const { productId } = req.params as { productId: string };
    await ensureProductExists(productId);

    if (!isR2Configured()) {
      throw new HttpError(503, "Upload de imagens não configurado (variáveis R2 ausentes)");
    }
    if (!req.file) throw new HttpError(400, "Arquivo de imagem ausente");

    const count = await prisma.productImage.count({ where: { productId } });
    if (count >= MAX_PHOTOS_PER_PRODUCT) {
      throw new HttpError(400, `Limite de ${MAX_PHOTOS_PER_PRODUCT} fotos por peça atingido. Apague uma foto antes de enviar outra.`);
    }

    const fields = uploadFieldsSchema.parse(req.body ?? {});
    const colorEnhanced = fields.colorEnhanced === "true";

    const photo = await normalizeToPortrait(req.file.buffer);
    const key = `products/${productId}/${randomUUID()}.${photo.ext}`;
    const url = await putObject(key, photo.buffer, photo.contentType);

    const lastImage = await prisma.productImage.findFirst({ where: { productId }, orderBy: { position: "desc" } });
    const image = await prisma.productImage.create({
      data: {
        productId,
        url,
        key,
        position: (lastImage?.position ?? -1) + 1,
        width: photo.after.w,
        height: photo.after.h,
        colorEnhanced,
        colorEnhanceLevel: colorEnhanced ? fields.colorEnhanceLevel ?? null : null,
      },
    });

    res.status(201).json(image);
  })
);

// A ordem define a capa: a primeira foto da lista é a principal.
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

// ÚNICO lugar do sistema que apaga arquivos do R2. Ação manual do admin, uma
// foto por vez (o frontend pede confirmação antes). Remove o registro e os
// arquivos DESTA foto — a imagem exibida e o "antes" guardado pelo tratamento
// (previousKey) — mas só os que nenhuma outra foto usa.
imageRouter.delete(
  "/:imageId",
  asyncHandler(async (req, res) => {
    const { productId, imageId } = req.params as { productId: string; imageId: string };
    await ensureProductExists(productId);

    const image = await prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image || image.productId !== productId) {
      throw new HttpError(404, "Imagem não encontrada");
    }

    const toRemove = await filesSafeToRemove([image]);

    // Registro primeiro: se o R2 falhar sobra um arquivo órfão (inofensivo),
    // nunca uma foto no site apontando para um arquivo que não existe.
    await prisma.productImage.delete({ where: { id: imageId } });
    await removeFiles(toRemove);

    res.status(204).send();
  })
);
