import type { MercadoLivreAccount, MercadoLivreListing } from "@prisma/client";
import { prisma } from "../prisma";
import { getMercadoLivrePublisherClient } from "./publisherClientRegistry";

export interface ListingSyncResult {
  ok: boolean;
  status?: string;
  permalink?: string;
  error?: string;
}

// Fase 1B etapa 6/8 — lê o status atual do item diretamente no Mercado Livre
// e atualiza a linha local. ÚNICA implementação, reaproveitada pela rota
// GET/POST /listings/:productId/sync (Etapa 6, mercadoLivre.routes.ts) E pelo
// processador do webhook de tópico de itens (Etapa 8, webhookProcessor.ts) —
// nunca duplicada. Falha na leitura NUNCA muda o status local (só grava
// lastError) — nunca assume um estado sem confirmar.
export async function syncListingFromRemote(account: MercadoLivreAccount, listing: MercadoLivreListing): Promise<ListingSyncResult> {
  if (!listing.mlItemId) {
    return { ok: false, error: "Anúncio sem mlItemId registrado — nada para sincronizar." };
  }

  const client = getMercadoLivrePublisherClient();
  try {
    const info = await client.getItem(account.id, listing.mlItemId);
    await prisma.mercadoLivreListing.update({
      where: { id: listing.id },
      data: { status: info.status, permalink: info.permalink, lastError: null, lastSyncAt: new Date() },
    });
    return { ok: true, status: info.status, permalink: info.permalink };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { lastError: message } });
    return { ok: false, error: message };
  }
}
