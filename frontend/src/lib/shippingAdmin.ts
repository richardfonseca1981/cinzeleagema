import type { CountryOption } from "./shipping/countries";
import type { ShippingUnavailableReason } from "./shipping/types";

// Regras puras da tela "Frete internacional" do admin (tudo em português).

export const MAX_WEIGHT_G = 1_000_000;
export const MAX_PRICE_BRL = 99_999_999.99;

// "1500" -> "1,5 kg", "380" -> "0,38 kg", "1000" -> "1 kg" (até 3 casas, sem zeros sobrando).
export function formatKg(grams: number): string {
  if (!Number.isFinite(grams)) return "";
  return `${(grams / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`;
}

// Aceita "12,5", "12.50" e "1.234,56". Devolve null quando não é um número com até 2 casas.
export function parsePrice(input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value <= MAX_PRICE_BRL ? value : null;
}

function parseWholeNumber(input: string): number | null {
  const text = input.trim();
  return /^\d+$/.test(text) ? Number(text) : null;
}

export interface RateDraft {
  serviceName: string;
  maxWeightG: string;
  priceBRL: string;
  deliveryDaysMin: string;
  deliveryDaysMax: string;
  active: boolean;
}

export interface RatePayload {
  serviceName: string;
  maxWeightG: number;
  priceBRL: number;
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
  active: boolean;
}

export function emptyRateDraft(): RateDraft {
  return { serviceName: "", maxWeightG: "", priceBRL: "", deliveryDaysMin: "", deliveryDaysMax: "", active: true };
}

// Mesmas regras do backend (a validação de verdade é lá), para avisar antes de enviar.
export function validateRateDraft(draft: RateDraft): { ok: true; payload: RatePayload } | { ok: false; error: string } {
  const serviceName = draft.serviceName.trim();
  if (!serviceName) return { ok: false, error: "Informe o nome do serviço" };
  if (serviceName.length > 80) return { ok: false, error: "O nome do serviço pode ter no máximo 80 caracteres" };

  const maxWeightG = parseWholeNumber(draft.maxWeightG);
  if (maxWeightG === null || maxWeightG <= 0) return { ok: false, error: "Informe até quantos gramas a faixa vale (número inteiro maior que zero)" };
  if (maxWeightG > MAX_WEIGHT_G) return { ok: false, error: `O peso máximo não pode passar de ${MAX_WEIGHT_G} g` };

  const priceBRL = parsePrice(draft.priceBRL);
  if (priceBRL === null) return { ok: false, error: "Informe o preço em R$ (até 2 casas decimais, ex: 120,50)" };

  const min = draft.deliveryDaysMin.trim() === "" ? null : parseWholeNumber(draft.deliveryDaysMin);
  const max = draft.deliveryDaysMax.trim() === "" ? null : parseWholeNumber(draft.deliveryDaysMax);
  if (draft.deliveryDaysMin.trim() !== "" && min === null) return { ok: false, error: "O prazo mínimo deve ser um número inteiro de dias" };
  if (draft.deliveryDaysMax.trim() !== "" && max === null) return { ok: false, error: "O prazo máximo deve ser um número inteiro de dias" };
  if (min !== null && max !== null && min > max) return { ok: false, error: "O prazo mínimo não pode ser maior que o prazo máximo" };

  return { ok: true, payload: { serviceName, maxWeightG, priceBRL, deliveryDaysMin: min, deliveryDaysMax: max, active: draft.active } };
}

// Busca de países sem acento e sem diferenciar maiúsculas ("estados unidos", "united", "US").
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function filterCountries(options: CountryOption[], query: string): CountryOption[] {
  const q = normalizeSearch(query);
  if (!q) return options;
  return options.filter((o) => normalizeSearch(o.name).includes(q) || o.code.toLowerCase() === q);
}

// Países escolhidos, na ordem alfabética dos nomes em português.
export function sortSelected(codes: string[], options: CountryOption[]): CountryOption[] {
  const byCode = new Map(options.map((o) => [o.code, o]));
  return codes
    .map((code) => byCode.get(code) ?? { code, name: code })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function formatDays(min: number | null, max: number | null): string {
  if (min === null && max === null) return "Prazo não informado";
  const lo = min ?? (max as number);
  const hi = max ?? (min as number);
  return lo === hi ? `${lo} ${lo === 1 ? "dia" : "dias"}` : `${lo} a ${hi} dias`;
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Resultado do "Testar destino" em português para o cliente entender a tabela.
export const SIMULATION_MESSAGES: Record<ShippingUnavailableReason, string> = {
  no_rates_configured: "Sem tarifa para este país: o comprador verá \"frete a combinar\" (zona inexistente, inativa ou sem faixas ativas).",
  over_limits: "Nenhum serviço tem faixa que comporte este peso: o comprador verá \"frete a combinar\".",
  incomplete_product_data: "Dados incompletos de produto: o comprador verá \"frete a combinar\".",
  invalid_destination: "Destino inválido.",
  provider_error: "Não foi possível consultar a tabela agora.",
  not_configured: "Frete não configurado.",
};
