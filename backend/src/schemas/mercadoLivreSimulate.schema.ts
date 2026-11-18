import { z } from "zod";

// Todos os campos ficam opcionais, SEM default no schema — a rota precisa
// distinguir "o admin informou" de "caiu no padrão" para cada um:
// markupPct cai para o markupPct da conta conectada (ou 0 sem conta); os
// demais caem nos UNVERIFIED_DEFAULT_* de priceCalculator.ts e isso é
// sinalizado em price.estimatesUsed na resposta.
export const mercadoLivreSimulateQuerySchema = z.object({
  markupPct: z.coerce.number().min(0).max(1000).optional(),
  commissionPct: z.coerce.number().min(0).max(100).optional(),
  fixedFeeBRL: z.coerce.number().min(0).optional(),
  shippingCostBRL: z.coerce.number().min(0).optional(),
});
