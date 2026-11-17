import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { markSoldBodySchema } from "../schemas/product.schema";
import { getActiveAccount } from "../lib/mercadoLivre/auth";
import { getMercadoLivrePublisherClient } from "../lib/mercadoLivre/publisherClientRegistry";
import { decideMarkSoldPauseAction } from "../lib/mercadoLivre/stockSync";
import { logMercadoLivreAttempt } from "../lib/mercadoLivre/log";
import { PRODUCT_INCLUDE } from "./product.routes";

// Fase 1B etapa 7 — marcar/desmarcar uma peça como "vendida" (fora do
// carrinho do site: venda presencial ou por outro canal) e reconciliar o
// anúncio do Mercado Livre quando fizer sentido (ver stockSync.ts). Montado
// em /api/admin/products (mesmo prefixo de productIdentification/
// productOrder/productExport), nunca em /api/products.
export const productStockRouter = Router();
productStockRouter.use(requireAuth);

productStockRouter.post(
  "/:id/mark-sold",
  asyncHandler(async (req, res) => {
    const body = markSoldBodySchema.parse(req.body);

    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw new HttpError(404, "Produto não encontrado");

    // Marca vendida + desativa sempre primeiro — idempotente (marcar de novo
    // só atualiza soldAt/soldChannel, nunca falha por já estar vendida).
    const updatedProduct = await prisma.product.update({
      where: { id: product.id },
      data: { soldAt: new Date(), soldChannel: body.channel, active: false },
      include: PRODUCT_INCLUDE,
    });

    const account = await getActiveAccount();
    const listing = account
      ? await prisma.mercadoLivreListing.findUnique({
          where: { accountId_productId: { accountId: account.id, productId: product.id } },
        })
      : null;

    const decision = decideMarkSoldPauseAction(body.channel, listing?.status ?? null);

    if (decision === "not_applicable" || !account || !listing) {
      logMercadoLivreAttempt({
        productId: product.id,
        mode: "mark-sold",
        result:
          body.channel === "mercadolivre" ? "ml_channel_no_pause_needed" : listing ? "listing_not_pausable" : "no_ml_listing",
      });
      res.json({ ...updatedProduct, mlListing: listing ? { status: listing.status } : null });
      return;
    }

    // A partir daqui: account e listing são garantidamente não-nulos
    // (decideMarkSoldPauseAction só devolve "already_paused"/"pause_needed"
    // quando listingStatus não é null).
    if (decision === "already_paused") {
      logMercadoLivreAttempt({ productId: product.id, mode: "mark-sold", result: "already_paused" });
      res.json({ ...updatedProduct, mlListing: { status: listing.status } });
      return;
    }

    // decision === "pause_needed"
    if (!listing.mlItemId) {
      await prisma.mercadoLivreListing.update({
        where: { id: listing.id },
        data: { lastError: "pause_pending: sem mlItemId registrado, rode a reconciliação" },
      });
      logMercadoLivreAttempt({ productId: product.id, mode: "mark-sold", result: "ml_pause_failed" });
      res.status(207).json({
        ...updatedProduct,
        mlListing: { status: listing.status },
        warning: "ml_pause_failed",
        detail: "Anúncio sem mlItemId registrado — rode a reconciliação antes de pausar manualmente.",
      });
      return;
    }

    const client = getMercadoLivrePublisherClient();
    try {
      await client.updateItemStatus(account.id, listing.mlItemId, "paused");
      const updatedListing = await prisma.mercadoLivreListing.update({
        where: { id: listing.id },
        data: { status: "paused", lastError: null, lastSyncAt: new Date() },
      });
      logMercadoLivreAttempt({ productId: product.id, mode: "mark-sold", result: "ml_paused" });
      res.json({ ...updatedProduct, mlListing: { status: updatedListing.status } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Peça continua vendida/inativa no site mesmo se a pausa falhar —
      // NUNCA falha em silêncio: lastError com a marca "pause_pending"
      // (visível no registro do anúncio) + resposta 207 com aviso claro.
      await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { lastError: `pause_pending: ${message}` } });
      logMercadoLivreAttempt({ productId: product.id, mode: "mark-sold", result: "ml_pause_failed" });
      res.status(207).json({
        ...updatedProduct,
        mlListing: { status: listing.status },
        warning: "ml_pause_failed",
        detail: `A peça foi marcada como vendida, mas não foi possível pausar o anúncio no Mercado Livre: ${message}. Pause manualmente ou rode a reconciliação.`,
      });
    }
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
