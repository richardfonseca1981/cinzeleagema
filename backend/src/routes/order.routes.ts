import { Router } from "express";
import { env } from "../lib/env";
import { asyncHandler } from "../utils/asyncHandler";
import { createOrderSchema } from "../schemas/order.schema";

export const orderRouter = Router();

// Rota pública: o site não tem checkout com pagamento, só encaminha o
// pedido. Tenta entregar ao FluxioDesk; se não estiver configurado ou a
// chamada falhar, devolve delivered=false e o frontend cai para o link do
// WhatsApp — nunca retorna erro só por causa dessa integração externa.
orderRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createOrderSchema.parse(req.body);

    if (!env.FLUXIODESK_API_URL || !env.FLUXIODESK_API_KEY) {
      return res.json({ delivered: false });
    }

    try {
      const fluxioRes = await fetch(env.FLUXIODESK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.FLUXIODESK_API_KEY}`,
        },
        body: JSON.stringify({ brand: "cinzelagema", ...data }),
        signal: AbortSignal.timeout(8000),
      });
      return res.json({ delivered: fluxioRes.ok });
    } catch {
      return res.json({ delivered: false });
    }
  })
);
