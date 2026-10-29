import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { identificationSaveSchema } from "../schemas/product.schema";
import { getSavedIdentification, proposeIdentification, saveIdentification } from "../lib/productIdentification";

// Identificação de catálogo por IA — montado em /api/admin/products (mesmo
// prefixo de productExport/productOrder), nunca em /api/products: os campos
// nunca são expostos nas rotas públicas (ver product.routes.ts).
export const productIdentificationRouter = Router();

productIdentificationRouter.use(requireAuth);

// Estado atual salvo — usado pelo formulário do admin para exibir a
// identificação já gravada ao abrir a peça (GET /api/products/:id é público
// e nunca inclui estes campos).
productIdentificationRouter.get(
  "/:id/identification",
  asyncHandler(async (req, res) => {
    res.json(await getSavedIdentification(req.params.id));
  })
);

// Passo 1: gera a proposta a partir das fotos — não grava nada.
productIdentificationRouter.post(
  "/:id/identification/generate",
  asyncHandler(async (req, res) => {
    res.json(await proposeIdentification(req.params.id));
  })
);

// Passo 2: grava os campos revisados/confirmados pelo admin.
productIdentificationRouter.put(
  "/:id/identification",
  asyncHandler(async (req, res) => {
    const data = identificationSaveSchema.parse(req.body);
    res.json(await saveIdentification(req.params.id, data));
  })
);
