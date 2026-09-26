import { z } from "zod";

export const createOrderSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        name: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
  totalEstimate: z.number().nonnegative(),
});
