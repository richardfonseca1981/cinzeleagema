import { randomUUID } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { confirmImageSchema, presignImageSchema, reorderImagesSchema } from "../schemas/product.schema";
import { createPresignedUpload, deleteObject, isR2Configured, putObject } from "../lib/r2";
import { normalizeToPortrait, PHOTO_MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE } from "../lib/photoFormat";

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

// Caminho oficial para fotos NOVAS: o arquivo passa pelo servidor, é colocado
// no formato final 9:16 (ver lib/photoFormat.ts), sem EXIF/GPS, e só então vai
// ao R2 e vira ProductImage. (O fluxo presign abaixo grava o arquivo bruto e
// não é mais usado pelo admin.)
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
        colorEnhanced,
        colorEnhanceLevel: colorEnhanced ? fields.colorEnhanceLevel ?? null : null,
      },
    });

    res.status(201).json(image);
  })
);

// Passo 1 (fluxo antigo, sem processamento): gera uma URL assinada para o frontend enviar o arquivo direto ao R2
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

    const { url, key, colorEnhanced, colorEnhanceLevel } = confirmImageSchema.parse(req.body);

    const lastImage = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: { position: "desc" },
    });

    const image = await prisma.productImage.create({
      data: {
        productId,
        url,
        key,
        position: (lastImage?.position ?? -1) + 1,
        colorEnhanced: colorEnhanced ?? false,
        colorEnhanceLevel: colorEnhanced ? colorEnhanceLevel ?? null : null,
      },
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
