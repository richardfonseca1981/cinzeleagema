import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { executeOperations } from "../lib/imageOperations";
import { describeAutoFit } from "../lib/autoFit";
import { resolveTreatmentOperations, type TreatmentRequest } from "../lib/photoTreatment";
import { treatmentInstructionSchema, treatmentOperationsRequestSchema } from "../schemas/product.schema";

// multipart (multer) não tem JSON aninhado nativo: "instruction" chega como
// campo de texto normal; para os atalhos do admin, o frontend manda
// "operations" como esse mesmo tipo de campo, mas com um JSON.stringify do
// array — por isso faz o parse manual aqui antes de validar com zod.
function parseRawTreatmentRequest(body: Record<string, unknown>): TreatmentRequest {
  if (typeof body.operations === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.operations);
    } catch {
      throw new HttpError(400, "Campo operations inválido (JSON malformado)");
    }
    return treatmentOperationsRequestSchema.parse({ operations: parsed });
  }

  return treatmentInstructionSchema.parse(body);
}

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
    if (!req.file) {
      throw new HttpError(400, "Arquivo de imagem ausente");
    }

    const request = parseRawTreatmentRequest(req.body);
    const result = await resolveTreatmentOperations(request);
    if (result.unclear) {
      return res.json({ unclear: true, suggestion: result.suggestion });
    }

    const { buffer, contentType, autoFit } = await executeOperations(req.file.buffer, result.operations);
    const notice = autoFit ? describeAutoFit(autoFit) : undefined;

    // Só "Enquadrar peça" e nada foi recortado: explica em vez de devolver
    // uma imagem idêntica à atual.
    if (autoFit && autoFit.action !== "cropped" && result.operations.length === 1) {
      return res.json({ unclear: false, noChange: true, operations: result.operations, notice });
    }

    res.json({
      unclear: false,
      operations: result.operations,
      previewDataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
      ...(notice ? { notice } : {}),
    });
  })
);
