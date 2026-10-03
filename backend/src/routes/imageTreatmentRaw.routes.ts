import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { treatmentPreviewSchema } from "../schemas/product.schema";
import { isAnthropicConfigured, interpretPhotoInstruction } from "../lib/claude";
import { executeOperations, operationsSchema } from "../lib/imageOperations";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES } });

export const imageTreatmentRawRouter = Router();

imageTreatmentRawRouter.use(requireAuth);

// Versão sem estado da rota /treatment/preview, para fotos "staged" no
// formulário de produto — ainda não têm productId/imageId reais porque só
// serão enviadas ao R2 quando o admin clicar em "Salvar produto". Reaproveita
// exatamente a mesma interpretação (Claude) e execução (Sharp/rembg) da rota
// com estado, mas recebe o arquivo bruto no corpo (multipart) e devolve o
// resultado já processado direto na resposta — nunca grava nada no banco nem
// no R2.
imageTreatmentRawRouter.post(
  "/treatment-preview-raw",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!isAnthropicConfigured()) {
      throw new HttpError(503, "Tratamento de foto por IA não configurado (ANTHROPIC_API_KEY ausente)");
    }
    if (!req.file) {
      throw new HttpError(400, "Arquivo de imagem ausente");
    }

    const { instruction } = treatmentPreviewSchema.parse(req.body);

    const interpretation = await interpretPhotoInstruction(instruction);
    if (interpretation.unclear) {
      return res.json({ unclear: true, suggestion: interpretation.suggestion });
    }

    // Nunca confia no que a IA retornou sem validar de novo contra a lista
    // fechada de operações e seus ranges (mesma validação da rota com estado).
    const operations = operationsSchema.parse(interpretation.operations);

    const { buffer, contentType } = await executeOperations(req.file.buffer, operations);

    res.json({
      unclear: false,
      operations,
      previewDataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
    });
  })
);
