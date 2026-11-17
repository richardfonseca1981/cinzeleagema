import { z } from "zod";

// Fase 1B etapa 5 — corpo de POST /publish/:productId. expectedPrice é o
// preço de anúncio que o admin VIU na tela (ver rota de simulação, Fase 1A)
// — o servidor sempre recalcula o preço de novo e rejeita se divergir, para
// nunca publicar com um preço defasado (ex.: markup da conta mudou entre a
// tela carregar e o clique em publicar). confirm só é exigido no modo
// "real": é a confirmação explícita pedida no plano, uma segunda trava além
// de ML_PUBLISH_ENABLED (que já força dry-run globalmente quando false).
export const mercadoLivrePublishBodySchema = z.object({
  mode: z.enum(["dry-run", "real"]),
  expectedPrice: z.coerce.number().positive(),
  confirm: z.boolean().optional().default(false),
});

export type MercadoLivrePublishBody = z.infer<typeof mercadoLivrePublishBodySchema>;
