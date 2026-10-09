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
import { getObject, isR2Configured, putObject } from "../lib/r2";
import { readStoredPhotoSize } from "../lib/storedPhotoSize";
import { executeOperations } from "../lib/imageOperations";
import { describeAutoFit } from "../lib/autoFit";
import { resolveTreatmentOperations } from "../lib/photoTreatment";

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

    if (!isR2Configured()) {
      throw new HttpError(503, "Upload de imagens não configurado (variáveis R2 ausentes)");
    }

    const body = treatmentPreviewSchema.parse(req.body);
    const result = await resolveTreatmentOperations(body);
    if (result.unclear) {
      return res.json({ unclear: true, suggestion: result.suggestion });
    }

    const original = await getObject(image.key);
    const { buffer, contentType, ext, autoFit } = await executeOperations(original, result.operations);
    const notice = autoFit ? describeAutoFit(autoFit) : undefined;

    // Só "Enquadrar peça" e nada foi recortado: explica em vez de gravar um
    // preview idêntico à foto atual no R2.
    if (autoFit && autoFit.action !== "cropped" && result.operations.length === 1) {
      return res.json({ unclear: false, noChange: true, operations: result.operations, notice });
    }

    const previewKey = `products/${productId}/previews/${randomUUID()}${ext}`;
    const previewUrl = await putObject(previewKey, buffer, contentType);

    res.json({ unclear: false, operations: result.operations, previewUrl, previewKey, ...(notice ? { notice } : {}) });
  })
);

// Passo 2a: admin confirma o preview — a versão anterior vira previousUrl/Key
// (permitindo desfazer) e o preview passa a ser a imagem atual.
imageTreatmentRouter.post(
  "/treatment/confirm",
  asyncHandler(async (req, res) => {
    const { productId, imageId } = req.params as { productId: string; imageId: string };
    const image = await ensureImageExists(productId, imageId);

    const { previewUrl, previewKey, colorEnhanced, colorEnhanceLevel } = treatmentConfirmSchema.parse(req.body);

    const size = await readStoredPhotoSize(previewKey);
    const updated = await prisma.productImage.update({
      where: { id: image.id },
      data: {
        width: size.width,
        height: size.height,
        previousUrl: image.url,
        previousKey: image.key,
        previousColorEnhanced: image.colorEnhanced,
        previousColorEnhanceLevel: image.colorEnhanceLevel,
        url: previewUrl,
        key: previewKey,
        // Se este tratamento não incluiu enhance_color, mantém o que já
        // estava marcado — a imagem atual pode continuar visualmente
        // realçada por um tratamento anterior, mesmo que este aqui só tenha
        // mexido em nitidez/brilho por cima do resultado colorido.
        colorEnhanced: colorEnhanced === true ? true : image.colorEnhanced,
        colorEnhanceLevel: colorEnhanced === true ? colorEnhanceLevel ?? null : image.colorEnhanceLevel,
      },
    });

    res.json(updated);
  })
);

// Passo 2b: admin descarta o preview — nada no banco muda. NÃO apaga nada no
// R2 (a única exclusão de arquivos do sistema é a do admin, foto a foto, em
// DELETE /images/:imageId); o preview descartado fica órfão e inofensivo.
imageTreatmentRouter.post(
  "/treatment/discard",
  asyncHandler(async (req, res) => {
    const { productId, imageId } = req.params as { productId: string; imageId: string };
    await ensureImageExists(productId, imageId);

    treatmentDiscardSchema.parse(req.body);

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

    const size = await readStoredPhotoSize(image.previousKey);
    const updated = await prisma.productImage.update({
      where: { id: image.id },
      data: {
        width: size.width,
        height: size.height,
        url: image.previousUrl,
        key: image.previousKey,
        previousUrl: null,
        previousKey: null,
        colorEnhanced: image.previousColorEnhanced,
        colorEnhanceLevel: image.previousColorEnhanceLevel,
        previousColorEnhanced: false,
        previousColorEnhanceLevel: null,
      },
    });

    res.json(updated);
  })
);
