import { Router, type Request } from "express";
import { createHash } from "crypto";
import { prisma } from "../lib/prisma";
import { createIpRateLimiter } from "../middleware/rateLimit";
import { asyncHandler } from "../utils/asyncHandler";
import { parseWebhookBody, processNewWebhookEvent } from "../lib/mercadoLivre/webhookProcessor";

declare global {
  namespace Express {
    interface Request {
      // Capturado pelo `verify` de express.json() em app.ts — bytes CRUS do
      // corpo, antes do parse, usados só pelo hash de deduplicação abaixo
      // (ver MercadoLivreWebhookEvent.bodyHash). Nenhuma outra rota usa isto.
      rawBody?: Buffer;
    }
  }
}

// Fase 1B etapa 8 — SUPOSIÇÃO FORTE em TUDO nesta rota: formato do corpo da
// notificação, tópicos existentes, se há assinatura/autenticação do lado do
// Mercado Livre, janela de retry — nada disso foi confirmado contra a doc
// atual (mesmo bloqueio 403 anti-bot, ver categoryFixture.ts). Ver
// CONTEXT.md "Mercado Livre — Fase 1B etapa 8" para a lista completa. Este
// endpoint só recebe tráfego real depois que o app do Mercado Livre existir
// (hoje bloqueado pelo cadastro no Mercado Pago) e a URL de notificação for
// cadastrada no painel deles — até lá, só testado com o cliente simulado.
export const mercadoLivreWebhookRouter = Router();

// Público (SEM requireAuth, de propósito — é o Mercado Livre chamando, não
// um admin autenticado) — rede de segurança contra abuso/loop, não uma
// estimativa de volume real de notificações (desconhecido até o app
// existir).
const webhookRateLimiter = createIpRateLimiter({ windowMs: 60_000, max: 120 });

mercadoLivreWebhookRouter.post(
  "/",
  webhookRateLimiter,
  asyncHandler(async (req: Request, res) => {
    // rawBody sempre deve existir (verify callback global, ver app.ts) —
    // fallback defensivo reserializando req.body só por segurança, nunca
    // esperado de acontecer na prática.
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const bodyHash = createHash("sha256").update(rawBody).digest("hex");

    // Dedup: o Mercado Livre reenvia a MESMA notificação em retry de entrega
    // — duas entregas byte-idênticas produzem o mesmo hash (ver
    // MercadoLivreWebhookEvent.bodyHash, Etapa 1). Evento repetido nunca
    // reprocessa, só confirma 200 de novo.
    const existing = await prisma.mercadoLivreWebhookEvent.findUnique({ where: { bodyHash } });
    if (existing) {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }

    const parsed = parseWebhookBody(req.body);
    const event = await prisma.mercadoLivreWebhookEvent.create({
      data: { bodyHash, topic: parsed.topic, resource: parsed.resource },
    });

    // Responde 200 JÁ — processamento roda DEPOIS, best-effort, nunca lança
    // (ver processNewWebhookEvent: todo erro vira lastError do próprio
    // evento, nunca uma exceção que chegaria até aqui). Fire-and-forget
    // deliberado (sem `await`): o Mercado Livre não deve esperar nenhuma
    // chamada nossa à API dele (GET do pedido/item) pra considerar a
    // notificação entregue.
    res.status(200).json({ ok: true, eventId: event.id });
    void processNewWebhookEvent(event.id, parsed);
  })
);
