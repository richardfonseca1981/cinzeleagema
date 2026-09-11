import { randomUUID } from "crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import {
  treatmentConfirmSchema,
  treatmentDiscardSchema,
  treatmentPreviewSchema,
} from "../schemas/product.schema";
import { deleteObject, getObject, isR2Configured, putObject } from "../lib/r2";
import { isAnthropicConfigured, interpretPhotoInstruction } from "../lib/claude";
import { executeOperations, operationsSchema } from "../lib/imageOperations";

export const imageTreatmentRouter = Router({ mergeParams: true });

imageTreatmentRouter.use(requireAuth);

async function ensureImageExists(productId: string, imageId: string) {
  const image = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!image || image.productId !== productId) {
    throw new HttpError(404, "Imagem não encontrada");
  }
  return image;
}

// Passo 1: interpreta o pedido em texto via Claude API (tool use forçado,
// lista fechada de operações), executa como pipeline e sobe um preview novo
// no R2 — nenhuma alteração é feita no produto até a confirmação.
imageTreatmentRouter.post(
  "/treatment/preview",
  asyncHandler(async (req, res) => {
    const { productId, imageId } = req.params as { productId: string; imageId: string };
    const image = await ensureImageExists(productId, imageId);

    if (!isAnthropicConfigured()) {
      throw new HttpError(503, "Tratamento de foto por IA não configurado (ANTHROPIC_API_KEY ausente)");
    }
    if (!isR2Configured()) {
      throw new HttpError(503, "Upload de imagens não configurado (variáveis R2 ausentes)");
    }

    const { instruction } = treatmentPreviewSchema.parse(req.body);

    const interpretation = await interpretPhotoInstruction(instruction);
    if (interpretation.unclear) {
      return res.json({ unclear: true, suggestion: interpretation.suggestion });
    }

    // Nunca confia no que a IA retornou sem validar de novo contra a lista
    // fechada de operações e seus ranges.
    const operations = operationsSchema.parse(interpretation.operations);

    const original = await getObject(image.key);
    const { buffer, contentType, ext } = await executeOperations(original, operations);

    const previewKey = `products/${productId}/previews/${randomUUID()}${ext}`;
    const previewUrl = await putObject(previewKey, buffer, contentType);

    res.json({ unclear: false, operations, previewUrl, previewKey });
  })
);

// Passo 2a: admin confirma o preview — a versão anterior vira previousUrl/Key
// (permitindo desfazer) e o preview passa a ser a imagem atual.
imageTreatmentRouter.post(
  "/treatment/confirm",
  asyncHandler(async (req, res) => {
    const { productId, imageId } = req.params as { productId: string; imageId: string };
    const image = await ensureImageExists(productId, imageId);

    const { previewUrl, previewKey } = treatmentConfirmSchema.parse(req.body);

    const updated = await prisma.productImage.update({
      where: { id: image.id },
      data: {
        previousUrl: image.url,
        previousKey: image.key,
        url: previewUrl,
        key: previewKey,
      },
    });

    res.json(updated);
  })
);

// Passo 2b: admin descarta o preview — só limpa o objeto no R2, nada no
// banco muda.
imageTreatmentRouter.post(
  "/treatment/discard",
  asyncHandler(async (req, res) => {
    const { productId, imageId } = req.params as { productId: string; imageId: string };
    await ensureImageExists(productId, imageId);

    const { previewKey } = treatmentDiscardSchema.parse(req.body);

    if (isR2Configured()) {
      await deleteObject(previewKey);
    }

    res.status(204).send();
  })
);

// Desfaz o último tratamento confirmado (um único nível — não é uma pilha).
imageTreatmentRouter.post(
  "/undo",
  asyncHandler(async (req, res) => {
    const { productId, imageId } = req.params as { productId: string; imageId: string };
    const image = await ensureImageExists(productId, imageId);

    if (!image.previousUrl || !image.previousKey) {
      throw new HttpError(400, "Nada para desfazer nesta imagem");
    }

    const updated = await prisma.productImage.update({
      where: { id: image.id },
      data: {
        url: image.previousUrl,
        key: image.previousKey,
        previousUrl: null,
        previousKey: null,
      },
    });

    res.json(updated);
  })
);
