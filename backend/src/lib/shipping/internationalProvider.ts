import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import { computeShipment, type ShipmentConfig, type ShipmentItem } from "./shipment";
import type { ShippingCalculationInput, ShippingOption, ShippingProvider, ShippingProviderResult } from "./types";

// Frete internacional por TABELA cadastrada pelo cliente no admin (zonas de
// países + faixas de peso por serviço). Nenhuma API externa. Todo valor aqui
// é DEFINITIVO (kind "quoted"). Impostos de importação não entram em nenhum
// cálculo — o aviso (notice) é montado em quoteService.
export class InternationalTableProvider implements ShippingProvider {
  constructor(private readonly db: Pick<PrismaClient, "shippingZone"> = prisma) {}

  // Escolhe, por serviço, a MENOR faixa ativa que comporta o peso total.
  //  - sem zona ativa com o país, ou zona sem tarifa ativa: no_rates_configured;
  //  - serviço sem faixa que comporte o peso é omitido; se nenhum comportar: over_limits.
  async calculate(input: ShippingCalculationInput): Promise<ShippingProviderResult> {
    const country = input.destinationCountry?.toUpperCase();
    if (!country || country === "BR") return { ok: false, reason: "invalid_destination" };

    const zone = await this.db.shippingZone.findFirst({
      where: { active: true, countries: { has: country } },
      include: { rates: { where: { active: true } } },
    });
    if (!zone || zone.rates.length === 0) return { ok: false, reason: "no_rates_configured" };

    const weight = input.shipment.weightGrams;
    const bestByService = new Map<string, (typeof zone.rates)[number]>();
    for (const rate of zone.rates) {
      if (rate.maxWeightG < weight) continue; // exatamente no limite ainda comporta
      const current = bestByService.get(rate.serviceName);
      if (!current || rate.maxWeightG < current.maxWeightG) bestByService.set(rate.serviceName, rate);
    }
    if (bestByService.size === 0) return { ok: false, reason: "over_limits" };

    const options: ShippingOption[] = [...bestByService.values()]
      .map((rate) => ({
        id: `intl-${rate.id}`,
        carrier: rate.serviceName,
        service: rate.serviceName,
        priceBRL: Math.round(Number(rate.priceBRL) * 100) / 100,
        deliveryDaysMin: rate.deliveryDaysMin,
        deliveryDaysMax: rate.deliveryDaysMax,
        kind: "quoted" as const,
      }))
      .sort((a, b) => a.priceBRL - b.priceBRL || a.service.localeCompare(b.service));

    return { ok: true, options };
  }

  // Mesmas regras de caixa do Brasil (computeShipment): peça acima do menor
  // lado da caixa ou volume acima de 60% -> over_limits; peso/tamanho zerados
  // -> incomplete_product_data. Depois consulta a tabela com o peso total
  // (peças + embalagem uma vez).
  async calculateForItems(country: string, items: ShipmentItem[], config: ShipmentConfig): Promise<ShippingProviderResult> {
    const computed = computeShipment(items, config);
    if (!computed.ok) return { ok: false, reason: computed.reason };
    return this.calculate({
      originPostalCode: "",
      destinationPostalCode: "",
      destinationCountry: country,
      shipment: computed.shipment,
    });
  }
}
