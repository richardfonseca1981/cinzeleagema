import { z } from "zod";

// commissionPct/fixedFeeBRL/shippingCostBRL ficam opcionais (sem default no
// schema) para a rota distinguir "o admin informou" de "caiu no padrão não
// verificado" (ver priceCalculator.ts) e sinalizar isso na resposta.
export const mercadoLivreSimulateQuerySchema = z.object({
  markupPct: z.coerce.number().min(0).max(1000).optional().default(0),
  commissionPct: z.coerce.number().min(0).max(100).optional(),
  fixedFeeBRL: z.coerce.number().min(0).optional(),
  shippingCostBRL: z.coerce.number().min(0).optional(),
});
