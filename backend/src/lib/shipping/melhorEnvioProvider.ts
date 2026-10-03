import { exceedsCarrierLimits } from "./limits";
import type { ShippingCalculationInput, ShippingOption, ShippingProvider, ShippingProviderResult } from "./types";

// Base URLs e path confirmados em
// docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos — SOMENTE
// o endpoint de cálculo. Nunca chamar carrinho/compra/geração ou
// cancelamento de etiquetas a partir deste módulo.
const PRODUCTION_BASE_URL = "https://melhorenvio.com.br";
const SANDBOX_BASE_URL = "https://sandbox.melhorenvio.com.br";
const CALCULATE_PATH = "/api/v2/me/shipment/calculate";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 1;

export interface MelhorEnvioProviderConfig {
  token: string;
  userAgent: string;
  sandbox: boolean;
  timeoutMs?: number;
  maxRetries?: number;
}

interface MelhorEnvioProductPayload {
  id: string;
  width: number;
  height: number;
  length: number;
  weight: number;
  insurance_value: number;
  quantity: number;
}

interface MelhorEnvioCalculateRequest {
  from: { postal_code: string };
  to: { postal_code: string };
  products: MelhorEnvioProductPayload[];
}

interface MelhorEnvioDeliveryRange {
  min: number;
  max: number;
}

interface MelhorEnvioServiceResponse {
  id: number | string;
  name?: string;
  price?: string | number | null;
  custom_price?: string | number | null;
  delivery_time?: number | null;
  delivery_range?: MelhorEnvioDeliveryRange | null;
  custom_delivery_time?: number | null;
  custom_delivery_range?: MelhorEnvioDeliveryRange | null;
  company?: { id?: number; name?: string } | null;
  // Não documentado oficialmente pela Melhor Envio, mas presente na prática
  // quando um serviço específico não consegue cotar (ex: fora do limite de
  // peso/dimensão daquela transportadora) — tratado defensivamente: qualquer
  // item com `error` preenchido ou sem preço numérico válido é omitido.
  error?: string | null;
}

interface MelhorEnvioErrorBody {
  message?: string;
  errors?: Record<string, string[]>;
}

export class MelhorEnvioProvider implements ShippingProvider {
  constructor(private readonly config: MelhorEnvioProviderConfig) {}

  async calculate(input: ShippingCalculationInput): Promise<ShippingProviderResult> {
    if (exceedsCarrierLimits(input.items)) {
      return { ok: false, reason: "over_limits" };
    }

    const payload = this.buildPayload(input);
    const baseUrl = this.config.sandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;
    const url = `${baseUrl}${CALCULATE_PATH}`;
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = this.config.maxRetries ?? DEFAULT_MAX_RETRIES;

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url, payload, timeoutMs);

        if (response.status === 401 || response.status === 403) {
          console.error(`Melhor Envio: token inválido ou expirado (HTTP ${response.status})`);
          return { ok: false, reason: "provider_error" };
        }

        if (!response.ok) {
          if (response.status >= 500 && attempt < maxRetries) {
            // Erro do lado da Melhor Envio — só esse caso vale tentar de novo.
            lastError = new Error(`Melhor Envio respondeu HTTP ${response.status}`);
            continue;
          }
          return { ok: false, reason: await this.classifyErrorResponse(response) };
        }

        const data = (await response.json()) as MelhorEnvioServiceResponse[];
        return this.mapResponse(data);
      } catch (err) {
        lastError = err;
        if (attempt >= maxRetries) break;
      }
    }

    console.error("Melhor Envio: falha ao calcular frete após tentativas de retry:", lastError);
    return { ok: false, reason: "provider_error" };
  }

  private async classifyErrorResponse(response: Response): Promise<"invalid_destination" | "provider_error"> {
    // 4xx de validação (ex: CEP malformado) não se resolve tentando de novo.
    const body = (await response.json().catch(() => null)) as MelhorEnvioErrorBody | null;
    const hasPostalCodeError = Boolean(body?.errors && Object.keys(body.errors).some((key) => key.includes("postal_code")));
    return hasPostalCodeError ? "invalid_destination" : "provider_error";
  }

  private buildPayload(input: ShippingCalculationInput): MelhorEnvioCalculateRequest {
    return {
      from: { postal_code: input.originPostalCode },
      to: { postal_code: input.destinationPostalCode },
      products: input.items.map((item) => ({
        id: item.productId,
        width: Math.ceil(item.package.widthCm),
        height: Math.ceil(item.package.heightCm),
        length: Math.ceil(item.package.lengthCm),
        weight: Number((item.package.weightGrams / 1000).toFixed(3)),
        insurance_value: item.unitPriceBRL,
        quantity: item.quantity,
      })),
    };
  }

  private async fetchWithTimeout(url: string, payload: unknown, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.token}`,
          "User-Agent": this.config.userAgent,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private mapResponse(data: MelhorEnvioServiceResponse[]): ShippingProviderResult {
    if (data.length === 0) {
      return { ok: false, reason: "no_rates_configured" };
    }

    const options: ShippingOption[] = [];

    for (const item of data) {
      if (item.error) {
        console.warn(`Melhor Envio: serviço "${item.name ?? item.id}" omitido (${item.error})`);
        continue;
      }

      const price = Number(item.custom_price ?? item.price);
      if (!Number.isFinite(price) || price <= 0) {
        console.warn(`Melhor Envio: serviço "${item.name ?? item.id}" omitido (preço ausente/inválido)`);
        continue;
      }

      const deliveryRange = item.custom_delivery_range ?? item.delivery_range ?? null;
      const deliveryDays = item.custom_delivery_time ?? item.delivery_time ?? null;

      options.push({
        id: String(item.id),
        carrier: item.company?.name ?? "Transportadora",
        service: item.name ?? "Serviço",
        priceBRL: Math.round(price * 100) / 100,
        deliveryDaysMin: deliveryRange?.min ?? deliveryDays,
        deliveryDaysMax: deliveryRange?.max ?? deliveryDays,
        kind: "quoted",
      });
    }

    if (options.length === 0) {
      return { ok: false, reason: "provider_error" };
    }

    return { ok: true, options };
  }
}

export interface MelhorEnvioEnvConfig {
  MELHOR_ENVIO_TOKEN: string;
  MELHOR_ENVIO_USER_AGENT: string;
  MELHOR_ENVIO_SANDBOX: boolean;
}

// null quando o token ou o User-Agent não estão configurados — o chamador
// (quoteService) trata isso como unavailable "not_configured", sem derrubar
// o servidor.
export function createMelhorEnvioProviderFromEnv(env: MelhorEnvioEnvConfig): MelhorEnvioProvider | null {
  if (!env.MELHOR_ENVIO_TOKEN || !env.MELHOR_ENVIO_USER_AGENT) return null;

  return new MelhorEnvioProvider({
    token: env.MELHOR_ENVIO_TOKEN,
    userAgent: env.MELHOR_ENVIO_USER_AGENT,
    sandbox: env.MELHOR_ENVIO_SANDBOX,
  });
}
