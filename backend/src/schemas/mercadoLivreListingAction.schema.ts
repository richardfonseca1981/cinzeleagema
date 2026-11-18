import { z } from "zod";

// Fase 1B etapa 6 — encerrar um anúncio é IRREVERSÍVEL (closed é terminal,
// ver listingLifecycle.ts) — confirmação reforçada com a string exata, não
// só um boolean `confirm: true` (mais fácil de mandar sem querer).
export const mercadoLivreCloseBodySchema = z.object({
  confirm: z.literal("ENCERRAR"),
});

// "Pausar tudo" afeta TODOS os anúncios ativos da conta de uma vez só —
// nunca automático, exige a mesma confirmação reforçada.
export const mercadoLivrePauseAllBodySchema = z.object({
  confirm: z.literal("PAUSAR TUDO"),
});
