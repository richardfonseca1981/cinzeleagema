import { z } from "zod";

export const BRAZIL_POSTAL_CODE_REGEX = /^\d{8}$/;

export function normalizePostalCode(raw: string): string {
  return raw.replace(/\D/g, "");
}

const shippingQuoteItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(99),
});

export const shippingQuoteSchema = z.object({
  country: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/, "País deve ser um código alpha-2 (ex: BR)")
    .transform((value) => value.toUpperCase()),
  // Obrigatório só no Brasil (8 dígitos — validado na rota). Fora do Brasil o
  // código postal é opcional: o comprador pode não saber/não ter, e o frete
  // internacional é confirmado pelo atendimento de qualquer forma.
  postalCode: z.string().optional().default(""),
  items: z.array(shippingQuoteItemSchema).min(1),
});
