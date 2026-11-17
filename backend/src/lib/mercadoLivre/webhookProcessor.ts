import type { MercadoLivreAccount } from "@prisma/client";
import { prisma } from "../prisma";
import { getActiveAccount } from "./auth";
import { getMercadoLivrePublisherClient } from "./publisherClientRegistry";
import { markProductSold } from "./stockSync";
import { syncListingFromRemote } from "./listingSync";
import { logMercadoLivreAttempt } from "./log";

// Fase 1B etapa 8 — processamento do webhook do Mercado Livre. SUPOSIÇÃO
// FORTE em TUDO abaixo (nomes de campo, tópicos existentes, formato de
// `resource`, estados de pedido) — NUNCA confirmado contra a doc atual
// (mesmo bloqueio 403 anti-bot documentado em categoryFixture.ts). Ver
// CONTEXT.md "Mercado Livre — Fase 1B etapa 8" para a lista completa.

export interface ParsedWebhookBody {
  topic: string | null;
  resource: string | null;
  userId: string | null;
}

// Nomes de campo (`topic`, `resource`, `user_id`) são o formato clássico,
// historicamente conhecido, de notificação do Mercado Livre — NUNCA
// confirmado contra a doc atual desta fase. Best-effort: campo ausente ou de
// tipo inesperado vira null, nunca lança (o corpo de um webhook público
// nunca é confiável).
export function parseWebhookBody(body: unknown): ParsedWebhookBody {
  if (!body || typeof body !== "object") return { topic: null, resource: null, userId: null };
  const obj = body as Record<string, unknown>;
  const topic = typeof obj.topic === "string" ? obj.topic : null;
  const resource = typeof obj.resource === "string" ? obj.resource : null;
  const userId = obj.user_id === undefined || obj.user_id === null ? null : String(obj.user_id);
  return { topic, resource, userId };
}

// SUPOSIÇÃO: formato de `resource` como "/orders/{id}" e "/items/{id}" —
// mesmo padrão usado nos outros endpoints desta integração (ver
// publisherClient.ts), nunca confirmado.
const ORDER_RESOURCE_PATTERN = /\/orders\/([\w-]+)/i;
const ITEM_RESOURCE_PATTERN = /\/items\/([\w-]+)/i;

// "error": falha técnica/retentável (grava lastError — elegível pra
// reprocessar). "note": resultado que não é erro, mas merece registro/
// atenção humana (tópico desconhecido, conta não conectada, user_id não
// bate, pedido cancelado, pedido em status irrelevante). "ok": sucesso limpo
// (opcionalmente com uma nota informativa, ex. "peça X marcada como
// vendida").
export type WebhookEventOutcome = { kind: "error"; message: string } | { kind: "note"; message: string } | { kind: "ok"; note?: string };

function outcomeMessage(outcome: WebhookEventOutcome): string {
  if (outcome.kind === "ok") return outcome.note ?? "Processado com sucesso.";
  return outcome.message;
}

async function finishEvent(eventId: string, outcome: WebhookEventOutcome): Promise<void> {
  const data =
    outcome.kind === "error"
      ? { processedAt: new Date(), lastError: outcome.message }
      : { processedAt: new Date(), lastError: null, note: outcomeMessage(outcome) };
  // .catch: mesmo a gravação do RESULTADO nunca pode derrubar o processo —
  // ver "nunca lançar" no pedido original.
  await prisma.mercadoLivreWebhookEvent.update({ where: { id: eventId }, data }).catch(() => {});
}

// Tópico de pedidos: busca o pedido (GET autenticado — nunca confia no
// corpo), localiza o produto pelo SKU do primeiro item com
// `sellerCustomField` reconhecível e, se pago, marca a peça vendida
// reutilizando a MESMA função de domínio do mark-sold (markProductSold,
// stockSync.ts — idempotente, canal sempre "mercadolivre", nunca tenta
// pausar o próprio anúncio que originou a venda). Pedido cancelado NUNCA
// desfaz nada sozinho — só registra um aviso pra decisão manual.
async function processOrderResource(account: MercadoLivreAccount, resource: string): Promise<WebhookEventOutcome> {
  const match = resource.match(ORDER_RESOURCE_PATTERN);
  if (!match) return { kind: "error", message: `resource inválido para o tópico orders_v2: "${resource}"` };
  const orderId = match[1];

  const client = getMercadoLivrePublisherClient();
  let order;
  try {
    order = await client.getOrder(account.id, orderId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "error", message: `Falha ao buscar o pedido ${orderId} no Mercado Livre: ${message}` };
  }

  // SUPOSIÇÃO: "paid"/"cancelled" são os únicos status com tratamento
  // especial (ver MercadoLivreOrderInfo.status, publisherClient.ts).
  if (order.status === "cancelled") {
    return {
      kind: "note",
      message: `Pedido ${orderId} cancelado — nenhuma ação automática (peça NÃO é desmarcada sozinha); revisão manual necessária.`,
    };
  }

  if (order.status !== "paid") {
    return {
      kind: "note",
      message: `Pedido ${orderId} em status "${order.status}" — ignorado (só "paid" dispara marcar vendida).`,
    };
  }

  const sku = order.items.map((item) => item.sellerCustomField).find((value): value is string => Boolean(value));
  if (!sku) {
    return { kind: "error", message: `Pedido ${orderId} pago, mas nenhum item do pedido tem SKU reconhecível.` };
  }

  const product = await prisma.product.findUnique({ where: { sku } });
  if (!product) {
    return { kind: "error", message: `Pedido ${orderId} pago — SKU "${sku}" não encontrado no catálogo, sem efeito.` };
  }

  const result = await markProductSold(product.id, "mercadolivre");
  logMercadoLivreAttempt({ productId: product.id, mode: "webhook-order", result: result.pauseOutcome });
  return { kind: "ok", note: `Pedido ${orderId} pago — peça ${product.id} (SKU "${sku}") marcada como vendida.` };
}

// Tópico de itens: mesma lógica de GET/POST /listings/:productId/sync (ver
// listingSync.ts) — localiza a linha local por mlItemId (não por produto,
// que o webhook não conhece) e sincroniza o status a partir do Mercado
// Livre.
async function processItemResource(account: MercadoLivreAccount, resource: string): Promise<WebhookEventOutcome> {
  const match = resource.match(ITEM_RESOURCE_PATTERN);
  if (!match) return { kind: "error", message: `resource inválido para o tópico items: "${resource}"` };
  const mlItemId = match[1];

  const listing = await prisma.mercadoLivreListing.findFirst({ where: { accountId: account.id, mlItemId } });
  if (!listing) {
    return { kind: "note", message: `Item ${mlItemId} não corresponde a nenhum anúncio conhecido nosso — ignorado.` };
  }

  const result = await syncListingFromRemote(account, listing);
  if (!result.ok) {
    return { kind: "error", message: `Falha ao sincronizar o item ${mlItemId}: ${result.error}` };
  }

  logMercadoLivreAttempt({ productId: listing.productId, mode: "webhook-item", result: "synced" });
  return { kind: "ok", note: `Item ${mlItemId} sincronizado — status "${result.status}".` };
}

// Roteamento por tópico — reaproveitado tanto pelo processamento de um
// evento NOVO quanto pelo reprocessamento manual (só o que muda entre os
// dois é a checagem de conta/user_id ao redor, ver as duas funções públicas
// abaixo).
async function runTopicAction(account: MercadoLivreAccount, topic: string | null, resource: string | null): Promise<WebhookEventOutcome> {
  if (!resource) return { kind: "note", message: `Tópico "${topic ?? "desconhecido"}" sem resource — ignorado.` };
  if (topic === "orders_v2") return processOrderResource(account, resource);
  if (topic === "items") return processItemResource(account, resource);
  return { kind: "note", message: `Tópico desconhecido: "${topic}" — registrado e ignorado.` };
}

// Processa um evento NOVO, logo após a resposta 200 já ter sido enviada (ver
// mercadoLivreWebhook.routes.ts) — best-effort, NUNCA lança (todo erro vira
// lastError do próprio evento). Inclui a checagem de conta conectada + o
// user_id da notificação batendo com o da conta (ponto 2 do pedido) — só
// aqui, nunca no reprocessamento manual (ver reprocessWebhookEvent).
export async function processNewWebhookEvent(eventId: string, parsed: ParsedWebhookBody): Promise<void> {
  try {
    const account = await getActiveAccount();
    if (!account) {
      await finishEvent(eventId, { kind: "note", message: "Nenhuma conta Mercado Livre conectada — notificação ignorada." });
      return;
    }

    if (parsed.userId === null || parsed.userId !== account.mlUserId) {
      await finishEvent(eventId, {
        kind: "note",
        message: `user_id da notificação (${parsed.userId ?? "ausente"}) não bate com a conta conectada — ignorada.`,
      });
      return;
    }

    const outcome = await runTopicAction(account, parsed.topic, parsed.resource);
    await finishEvent(eventId, outcome);
  } catch (err) {
    // Rede de segurança final — mesmo um bug inesperado aqui nunca pode
    // escapar como exceção não tratada (ver ponto 1 do pedido).
    const message = err instanceof Error ? err.message : String(err);
    await finishEvent(eventId, { kind: "error", message: `Erro inesperado ao processar o evento: ${message}` });
  }
}

// Reprocessamento manual (rota admin) — o Mercado Livre só reenvia uma
// notificação quando não recebe 200 rápido o suficiente; como respondemos
// 200 ANTES de processar, um erro depois nunca seria repetido sozinho. Usa
// só o que já está salvo no evento (topic/resource — nunca o corpo original,
// que não é persistido) e PULA a checagem de user_id: é uma ação
// autenticada do admin, confiança diferente de uma notificação pública
// anônima — mas ainda exige conta conectada.
export async function reprocessWebhookEvent(eventId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const event = await prisma.mercadoLivreWebhookEvent.findUnique({ where: { id: eventId } });
    if (!event) return { ok: false, message: "Evento não encontrado." };

    const account = await getActiveAccount();
    if (!account) {
      const outcome: WebhookEventOutcome = { kind: "note", message: "Nenhuma conta Mercado Livre conectada — não foi possível reprocessar." };
      await finishEvent(eventId, outcome);
      return { ok: false, message: outcomeMessage(outcome) };
    }

    const outcome = await runTopicAction(account, event.topic, event.resource);
    await finishEvent(eventId, outcome);
    return { ok: outcome.kind !== "error", message: outcomeMessage(outcome) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const outcome: WebhookEventOutcome = { kind: "error", message: `Erro inesperado ao reprocessar: ${message}` };
    await finishEvent(eventId, outcome);
    return { ok: false, message: outcomeMessage(outcome) };
  }
}
