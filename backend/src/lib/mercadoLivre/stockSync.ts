import type { Product, Prisma } from "@prisma/client";
import type { SoldChannel } from "../../schemas/product.schema";
import { prisma } from "../prisma";
import { getActiveAccount } from "./auth";
import { getMercadoLivrePublisherClient } from "./publisherClientRegistry";

// Fase 1B etapa 7 — reconciliação de estoque site -> Mercado Livre. Função
// PURA (sem nenhuma chamada de rede/banco): decide o que a rota de "marcar
// vendida" deve fazer com o anúncio ML da peça, dado o canal da venda e o
// status ATUAL (local) do anúncio — nunca decide sozinha chamando a API,
// só diz "o que fazer" para quem chama (product.routes.ts) executar.
export type MarkSoldPauseDecision = "not_applicable" | "already_paused" | "pause_needed";

// "mercadolivre" como canal NUNCA tenta pausar por aqui — a venda já
// aconteceu NO Mercado Livre, que encerra/pausa o próprio anúncio do lado
// dele (SUPOSIÇÃO não verificada, ver CONTEXT.md "débitos" desta etapa).
// Sem nenhum anúncio (`listingStatus` null — peça nunca publicada, ou conta
// desconectada) também não há o que fazer. "paused" já está parado —
// idempotente, nunca chama a API de novo à toa. "publishing"/"error"/
// "closed" ficam de fora de propósito: o estado real no Mercado Livre é
// desconhecido/ambíguo (publishing/error, precisa de reconciliação antes) ou
// já terminal (closed) — tentar pausar automaticamente nesses casos
// arriscaria mais do que ajudar. Só "active" é seguro o bastante pra pausar
// sem intervenção manual.
export function decideMarkSoldPauseAction(channel: SoldChannel, listingStatus: string | null): MarkSoldPauseDecision {
  if (channel === "mercadolivre") return "not_applicable";
  if (listingStatus === null) return "not_applicable";
  if (listingStatus === "active") return "pause_needed";
  if (listingStatus === "paused") return "already_paused";
  return "not_applicable";
}

export type MarkSoldPauseOutcome = "not_applicable" | "already_paused" | "paused" | "pause_failed";

export interface MarkProductSoldResult<P = Product> {
  product: P;
  mlListing: { status: string } | null;
  pauseOutcome: MarkSoldPauseOutcome;
  pauseError?: string;
}

// Função de domínio ÚNICA pra marcar uma peça vendida — reaproveitada pela
// rota HTTP (productStock.routes.ts, Etapa 7) E pelo processador do webhook
// de pedidos (webhookProcessor.ts, Etapa 8): "reutilizando a MESMA função de
// domínio do mark-sold" era pedido explícito do cliente pra garantir
// idempotência num único lugar (marcar vendida duas vezes nunca duplica
// efeito — o `prisma.product.update` sempre só sobrescreve soldAt/
// soldChannel). `include` opcional repassado ao Prisma: a rota HTTP usa
// PRODUCT_INCLUDE (fotos/categoria, pra devolver a peça completa), o webhook
// não precisa de nada além dos campos escalares (nunca serializa a resposta
// pro ML, só grava no nosso banco).
export async function markProductSold<Include extends Prisma.ProductInclude | undefined = undefined>(
  productId: string,
  channel: SoldChannel,
  include?: Include
): Promise<MarkProductSoldResult<Prisma.ProductGetPayload<{ include: Include }>>> {
  const updatedProduct = (await prisma.product.update({
    where: { id: productId },
    data: { soldAt: new Date(), soldChannel: channel, active: false },
    ...(include ? { include } : {}),
  })) as Prisma.ProductGetPayload<{ include: Include }>;

  const account = await getActiveAccount();
  const listing = account
    ? await prisma.mercadoLivreListing.findUnique({
        where: { accountId_productId: { accountId: account.id, productId } },
      })
    : null;

  const decision = decideMarkSoldPauseAction(channel, listing?.status ?? null);

  if (decision === "not_applicable" || !account || !listing) {
    return { product: updatedProduct, mlListing: listing ? { status: listing.status } : null, pauseOutcome: "not_applicable" };
  }

  // A partir daqui: account e listing são garantidamente não-nulos
  // (decideMarkSoldPauseAction só devolve "already_paused"/"pause_needed"
  // quando listingStatus não é null).
  if (decision === "already_paused") {
    return { product: updatedProduct, mlListing: { status: listing.status }, pauseOutcome: "already_paused" };
  }

  // decision === "pause_needed"
  if (!listing.mlItemId) {
    await prisma.mercadoLivreListing.update({
      where: { id: listing.id },
      data: { lastError: "pause_pending: sem mlItemId registrado, rode a reconciliação" },
    });
    return {
      product: updatedProduct,
      mlListing: { status: listing.status },
      pauseOutcome: "pause_failed",
      pauseError: "Anúncio sem mlItemId registrado — rode a reconciliação antes de pausar manualmente.",
    };
  }

  const client = getMercadoLivrePublisherClient();
  try {
    await client.updateItemStatus(account.id, listing.mlItemId, "paused");
    const updatedListing = await prisma.mercadoLivreListing.update({
      where: { id: listing.id },
      data: { status: "paused", lastError: null, lastSyncAt: new Date() },
    });
    return { product: updatedProduct, mlListing: { status: updatedListing.status }, pauseOutcome: "paused" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Peça continua vendida/inativa no site mesmo se a pausa falhar — NUNCA
    // falha em silêncio: lastError com a marca "pause_pending" (visível no
    // registro do anúncio), quem chama decide como reportar (207 na rota
    // HTTP, lastError do próprio evento no webhook).
    await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { lastError: `pause_pending: ${message}` } });
    return { product: updatedProduct, mlListing: { status: listing.status }, pauseOutcome: "pause_failed", pauseError: message };
  }
}
