import { z } from "zod";
import { isValidCountryCode } from "../lib/shipping/countryCodes";

const countryCodeSchema = z
  .string({ required_error: "Informe o país", invalid_type_error: "País deve ser um código de 2 letras (ex: US)" })
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{2}$/.test(value) && isValidCountryCode(value), {
    message: "País inválido: use códigos ISO de 2 letras (ex: US, PT, AR)",
  })
  .refine((value) => value !== "BR", {
    message: "O Brasil não entra na tabela internacional: o frete nacional é cotado pela Melhor Envio",
  });

const zoneNameSchema = z
  .string({ required_error: "Informe o nome da zona", invalid_type_error: "Nome da zona inválido" })
  .trim()
  .min(1, "Informe o nome da zona")
  .max(80, "O nome da zona pode ter no máximo 80 caracteres");

const countriesSchema = z
  .array(countryCodeSchema, { required_error: "Escolha ao menos um país", invalid_type_error: "Lista de países inválida" })
  .min(1, "Escolha ao menos um país")
  .transform((codes) => [...new Set(codes)]);

export const createZoneSchema = z.object({
  name: zoneNameSchema,
  countries: countriesSchema,
  active: z.boolean({ invalid_type_error: "Ativa deve ser verdadeiro ou falso" }).optional().default(true),
  position: z.number().int("A posição deve ser um número inteiro").min(0, "A posição não pode ser negativa").optional().default(0),
});

export const updateZoneSchema = z.object({
  name: zoneNameSchema.optional(),
  countries: countriesSchema.optional(),
  active: z.boolean({ invalid_type_error: "Ativa deve ser verdadeiro ou falso" }).optional(),
  position: z.number().int("A posição deve ser um número inteiro").min(0, "A posição não pode ser negativa").optional(),
});

export const MAX_RATE_WEIGHT_G = 1_000_000;
export const MAX_RATE_PRICE_BRL = 99_999_999.99;

const serviceNameSchema = z
  .string({ required_error: "Informe o nome do serviço", invalid_type_error: "Nome do serviço inválido" })
  .trim()
  .min(1, "Informe o nome do serviço")
  .max(80, "O nome do serviço pode ter no máximo 80 caracteres");

const maxWeightSchema = z
  .number({ required_error: "Informe até quantos gramas a faixa vale", invalid_type_error: "O peso deve ser um número" })
  .int("O peso máximo deve ser um número inteiro de gramas")
  .positive("O peso máximo deve ser maior que zero")
  .max(MAX_RATE_WEIGHT_G, `O peso máximo não pode passar de ${MAX_RATE_WEIGHT_G} g`);

const priceSchema = z
  .number({ required_error: "Informe o preço", invalid_type_error: "O preço deve ser um número" })
  .min(0, "O preço não pode ser negativo")
  .max(MAX_RATE_PRICE_BRL, "Preço alto demais")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "O preço deve ter no máximo 2 casas decimais",
  });

const daysSchema = z
  .number({ invalid_type_error: "O prazo deve ser um número" })
  .int("O prazo deve ser um número inteiro de dias")
  .min(0, "O prazo não pode ser negativo")
  .max(365, "O prazo não pode passar de 365 dias")
  .nullable()
  .optional();

const activeSchema = z.boolean({ invalid_type_error: "Ativa deve ser verdadeiro ou falso" });

export const createRateSchema = z.object({
  serviceName: serviceNameSchema,
  maxWeightG: maxWeightSchema,
  priceBRL: priceSchema,
  deliveryDaysMin: daysSchema,
  deliveryDaysMax: daysSchema,
  active: activeSchema.optional().default(true),
});

export const updateRateSchema = z.object({
  serviceName: serviceNameSchema.optional(),
  maxWeightG: maxWeightSchema.optional(),
  priceBRL: priceSchema.optional(),
  deliveryDaysMin: daysSchema,
  deliveryDaysMax: daysSchema,
  active: activeSchema.optional(),
});

export const DAYS_ORDER_MESSAGE = "O prazo mínimo não pode ser maior que o prazo máximo";

export function daysAreOrdered(min: number | null | undefined, max: number | null | undefined): boolean {
  return min == null || max == null || min <= max;
}

export const simulateSchema = z.object({
  country: countryCodeSchema,
  weightGrams: z
    .number({ required_error: "Informe o peso em gramas", invalid_type_error: "O peso deve ser um número" })
    .int("O peso deve ser um número inteiro de gramas")
    .positive("O peso deve ser maior que zero")
    .max(MAX_RATE_WEIGHT_G, `O peso não pode passar de ${MAX_RATE_WEIGHT_G} g`),
});
