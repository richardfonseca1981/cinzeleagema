import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { markSoldBodySchema } from "../schemas/product.schema";
import { markProductSold } from "../lib/mercadoLivre/stockSync";
import { logMercadoLivreAttempt } from "../lib/mercadoLivre/log";
import { PRODUCT_INCLUDE } from "./product.routes";

// Fase 1B etapa 7 — marcar/desmarcar uma peça como "vendida" (fora do
// carrinho do site: venda presencial ou por outro canal) e reconciliar o
// anúncio do Mercado Livre quando fizer sentido (ver stockSync.ts
// markProductSold — MESMA função de domínio reaproveitada pelo processador
// do webhook de pedidos, Etapa 8). Montado em /api/admin/products (mesmo
// prefixo de productIdentification/productOrder/productExport), nunca em
// /api/products.
export const productStockRouter = Router();
productStockRouter.use(requireAuth);

productStockRouter.post(
  "/:id/mark-sold",
  asyncHandler(async (req, res) => {
    const body = markSoldBodySchema.parse(req.body);

    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw new HttpError(404, "Produto não encontrado");

    const result = await markProductSold(product.id, body.channel, PRODUCT_INCLUDE);

    logMercadoLivreAttempt({ productId: product.id, mode: "mark-sold", result: result.pauseOutcome });

    if (result.pauseOutcome === "pause_failed") {
      res.status(207).json({
        ...result.product,
        mlListing: result.mlListing,
        warning: "ml_pause_failed",
        detail: `A peça foi marcada como vendida, mas não foi possível pausar o anúncio no Mercado Livre: ${result.pauseError}. Pause manualmente ou rode a reconciliação.`,
      });
      return;
    }

    res.json({ ...result.product, mlListing: result.mlListing });
  })
);

// Desfazer um engano — NUNCA mexe no anúncio ML (fica pausado até uma
// reativação manual consciente via POST /listings/:productId/reactivate,
// mesmo que a peça volte a ficar ativa no site).
productStockRouter.post(
  "/:id/unmark-sold",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw new HttpError(404, "Produto não encontrado");

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { soldAt: null, soldChannel: null, active: true },
      include: PRODUCT_INCLUDE,
    });
    res.json(updated);
  })
);

// Etapa "título aprovado" — aprovar/remover aprovação são SEMPRE ações
// explícitas e separadas de editar mlTitle (ver product.routes.ts PATCH
// /:id, que já limpa mlTitleApprovedAt sozinho quando mlTitle muda). Exige
// mlTitle preenchido pra aprovar (nunca aprova string vazia/nula) — não há
// corpo de requisição em nenhuma das duas.
productStockRouter.post(
  "/:id/ml-title/approve",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw new HttpError(404, "Produto não encontrado");
    if (!product.mlTitle?.trim()) {
      throw new HttpError(400, "Defina um título (mlTitle) antes de aprovar.");
    }

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { mlTitleApprovedAt: new Date() },
      include: PRODUCT_INCLUDE,
    });
    res.json(updated);
  })
);

productStockRouter.post(
  "/:id/ml-title/unapprove",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw new HttpError(404, "Produto não encontrado");

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { mlTitleApprovedAt: null },
      include: PRODUCT_INCLUDE,
    });
    res.json(updated);
  })
);
