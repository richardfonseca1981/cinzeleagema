import "dotenv/config";
import { z } from "zod";

// Exportado (não só o `env` já parseado abaixo) para o teste de parsing de
// ML_PUBLISH_ENABLED (tests/env.test.ts) validar o schema de um campo
// isoladamente, sem precisar montar um process.env completo.
export const envSchema = z.object({
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

  // Mercado Livre (Fase 0 — ver lib/mercadoLivre/). Tudo opcional no boot:
  // sem essas variáveis, as rotas /api/admin/mercadolivre respondem 503
  // "not_configured" em vez de derrubar o servidor.
  ML_APP_ID: z.string().optional().default(""),
  ML_CLIENT_SECRET: z.string().optional().default(""),
  ML_REDIRECT_URI: z.string().optional().default(""),
  ML_ENV: z.enum(["test", "prod"]).optional().default("test"),
  ML_TOKEN_ENC_KEY: z.string().optional().default(""),
  // Fase 1B (publicação) — kill switch global: "false" (padrão, inclusive em
  // produção até decisão explícita em contrário) força toda tentativa de
  // publicar/pausar/encerrar a cair em dry-run (cliente simulado, nenhuma
  // chamada real), mesmo com conta conectada e peça apta. Ver
  // lib/mercadoLivre/publisherClient.ts.
  ML_PUBLISH_ENABLED: z
    .string()
    .optional()
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  // "" (padrão) propositalmente SEM fallback para um valor "razoável": qual
  // listing_type_id é correto depende do plano de anúncio contratado pelo
  // vendedor (ex.: "gold_special" — SUPOSIÇÃO, não verificado contra a API
  // real) e publicar com o tipo errado tem custo real (exposição/tarifa
  // diferentes) — melhor falhar alto e claro (ver publisherPayload.ts) do
  // que assumir em silêncio.
  ML_LISTING_TYPE_ID: z.string().optional().default(""),
  // Limite de tamanho da descrição estendida do anúncio (ver
  // lib/mercadoLivre/descriptionBuilder.ts) — SUPOSIÇÃO não verificada: o
  // limite real de `plain_text` em POST /items/{id}/description nunca foi
  // confirmado contra a doc atual (mesmo bloqueio 403, ver
  // categoryFixture.ts). Configurável via env para ajustar sem deploy de
  // código quando o limite real for confirmado.
  ML_DESCRIPTION_MAX_CHARS: z.coerce.number().int().positive().optional().default(5000),

  // Fase 1B etapa 4 — presets de caixa de embalagem (ver
  // lib/mercadoLivre/packagePresets.ts estimatePackageBox). SUPOSIÇÃO FORTE,
  // não verificada: nem as dimensões reais das caixas usadas pelo cliente,
  // nem o formato de `shipping.dimensions` do Mercado Livre (mesmo bloqueio
  // 403 da doc, ver categoryFixture.ts) foram confirmados — só um ponto de
  // partida conservador até existir override manual por peça (última etapa
  // do plano, ver CONTEXT.md). Peso extra de embalagem: mesmo valor
  // conservador já usado no frete nacional por falta de dado melhor (ver
  // SHIPPING_PACKAGING_WEIGHT_G acima).
  ML_PACKAGE_WEIGHT_MARGIN_G: z.coerce.number().positive().optional().default(300),
  // Acima destes limites (tamanho OU peso), a peça não cabe nem no maior
  // preset (GG) — bloqueada até um override manual existir (ver
  // listingBuilder.ts assertReadyToPublish, código package_requires_manual).
  // Nunca "chuta" uma caixa maior sem confirmação.
  ML_PACKAGE_MAX_SIZE_CM: z.coerce.number().positive().optional().default(60),
  ML_PACKAGE_MAX_WEIGHT_G: z.coerce.number().positive().optional().default(15000),
  // Dimensões (cm) de cada preset — comprimento x largura x altura da CAIXA,
  // não da peça. Ver packagePresets.ts para a faixa de peça (tamanho/peso)
  // que cada preset cobre e o raciocínio por trás dos valores abaixo.
  ML_PACKAGE_BOX_P_LENGTH_CM: z.coerce.number().positive().optional().default(20),
  ML_PACKAGE_BOX_P_WIDTH_CM: z.coerce.number().positive().optional().default(16),
  ML_PACKAGE_BOX_P_HEIGHT_CM: z.coerce.number().positive().optional().default(12),
  ML_PACKAGE_BOX_M_LENGTH_CM: z.coerce.number().positive().optional().default(35),
  ML_PACKAGE_BOX_M_WIDTH_CM: z.coerce.number().positive().optional().default(28),
  ML_PACKAGE_BOX_M_HEIGHT_CM: z.coerce.number().positive().optional().default(20),
  ML_PACKAGE_BOX_G_LENGTH_CM: z.coerce.number().positive().optional().default(50),
  ML_PACKAGE_BOX_G_WIDTH_CM: z.coerce.number().positive().optional().default(40),
  ML_PACKAGE_BOX_G_HEIGHT_CM: z.coerce.number().positive().optional().default(30),
  ML_PACKAGE_BOX_GG_LENGTH_CM: z.coerce.number().positive().optional().default(65),
  ML_PACKAGE_BOX_GG_WIDTH_CM: z.coerce.number().positive().optional().default(50),
  ML_PACKAGE_BOX_GG_HEIGHT_CM: z.coerce.number().positive().optional().default(40),
  // Fase 1B etapa 10 — tetos do override MANUAL de embalagem por peça (ver
  // packagePresets.ts resolveManualPackageOverride). Precisam ser MAIORES
  // que os presets automáticos acima (senão o override nunca ajudaria as
  // peças que já ficam bloqueadas por eles) — ainda assim um teto, não um
  // "sem limite": protege contra erro de digitação (ex.: 6200cm por engano).
  // Valores padrão SUPOSIÇÃO não verificada — nenhuma medida real de caixa
  // excepcional (obelisco/capela grande) foi confirmada com o cliente ainda,
  // só escolhidos generosos o bastante pra cobrir os casos conhecidos hoje
  // do catálogo (ver CONTEXT.md "Mercado Livre — Fase 1B etapa 10").
  ML_PACKAGE_OVERRIDE_MAX_DIMENSION_CM: z.coerce.number().positive().optional().default(100),
  ML_PACKAGE_OVERRIDE_MAX_WEIGHT_G: z.coerce.number().positive().optional().default(30000),

  // Base das URLs absolutas do sitemap público (ver routes/sitemap.routes.ts)
  // e da URL pública de produto usada no CSV do script de auditoria do
  // Mercado Livre (ver scripts/auditMercadoLivre.ts, coluna url_publica) —
  // sempre o host com "www", mesmo domínio do <link rel="canonical"> do
  // frontend (VITE_SITE_URL). Sem barra final.
  PUBLIC_SITE_URL: z.string().optional().default("https://www.cinzeleagema.com.br"),
});

export const env = envSchema.parse(process.env);
