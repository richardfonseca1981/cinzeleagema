import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3334),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  CORS_ORIGIN: z
    .string()
    .min(1)
    .default("http://localhost:5174,http://localhost:5173,https://cinzeleagema.com.br,https://www.cinzeleagema.com.br")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),
  JWT_SECRET: z.string().min(1, "JWT_SECRET é obrigatório"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  R2_ACCOUNT_ID: z.string().optional().default(""),
  R2_ACCESS_KEY_ID: z.string().optional().default(""),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
  R2_BUCKET_NAME: z.string().optional().default(""),
  R2_ENDPOINT: z.string().optional().default(""),
  R2_PUBLIC_URL: z.string().optional().default(""),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  REMBG_SERVICE_URL: z.string().optional().default("http://localhost:8001"),
  REMBG_SERVICE_SECRET: z.string().optional().default(""),
  FLUXIODESK_API_URL: z.string().optional().default(""),
  FLUXIODESK_API_KEY: z.string().optional().default(""),

  // Frete nacional (Melhor Envio, só o endpoint de cálculo — ver
  // lib/shipping/melhorEnvioProvider.ts). Tudo opcional no boot: sem token
  // ou CEP de origem, POST /api/shipping/quote responde "indisponível"
  // (reason "not_configured") em vez de derrubar o servidor.
  MELHOR_ENVIO_TOKEN: z.string().optional().default(""),
  // Formato exigido pela Melhor Envio: "Nome da aplicação (email técnico)".
  MELHOR_ENVIO_USER_AGENT: z.string().optional().default(""),
  MELHOR_ENVIO_SANDBOX: z
    .string()
    .optional()
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  SHIPPING_ORIGIN_CEP: z
    .string()
    .optional()
    .default("")
    .refine((value) => value === "" || /^\d{8}$/.test(value), "SHIPPING_ORIGIN_CEP deve ter 8 dígitos"),
  // Caixa fixa única usada em todo pedido (decisão do cliente — sem cadastro
  // de caixa; ver lib/shipping/shipment.ts). Comprimento x largura x altura.
  SHIPPING_BOX_LENGTH_CM: z.coerce.number().positive().optional().default(40),
  SHIPPING_BOX_WIDTH_CM: z.coerce.number().positive().optional().default(30),
  SHIPPING_BOX_HEIGHT_CM: z.coerce.number().positive().optional().default(25),
  // Peso da embalagem vazia (gramas), somado uma vez ao peso das peças.
  SHIPPING_PACKAGING_WEIGHT_G: z.coerce.number().positive().optional().default(300),
});

export const env = envSchema.parse(process.env);
