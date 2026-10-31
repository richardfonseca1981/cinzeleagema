import { isRateApproximate, type RateSource } from "./exchangeRateQuality";
import type { CatalogJobRequest, CatalogLanguage, CatalogQuality } from "../types";

export function formatCatalogBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export type CatalogDividerChoice = "auto" | "yes" | "no";

export interface CatalogFormState {
  scope: "all" | "selected";
  selectedIds: string[];
  language: CatalogLanguage;
  showPrice: boolean;
  showRef: boolean;
  dividers: CatalogDividerChoice;
  includeContactPage: boolean;
  quality: CatalogQuality;
}

// Monta o corpo de POST /api/admin/catalog/jobs a partir do estado do
// formulário — "auto" não manda includeCategoryDividers (o backend decide
// pelo limiar de peças/categorias, ver generateCatalogPdf.ts).
export function buildCatalogJobRequest(state: CatalogFormState): CatalogJobRequest {
  return {
    productIds: state.scope === "selected" ? state.selectedIds : undefined,
    language: state.language,
    showPrice: state.showPrice,
    showRef: state.showRef,
    includeCategoryDividers: state.dividers === "auto" ? undefined : state.dividers === "yes",
    includeContactPage: state.includeContactPage,
    quality: state.quality,
  };
}

function formatRateDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// "Cotação do dólar desatualizada: R$ 5,30 em 20/10 14:32" — null quando não
// há cotação (catálogo em PT, ou preço oculto) ou quando ela está "live".
export function staleRateWarning(info: { rate: number | null; rateSource: RateSource | null; rateUpdatedAt: string | null }): string | null {
  if (info.rate === null) return null;
  if (!isRateApproximate({ source: info.rateSource, updatedAt: info.rateUpdatedAt }, Date.now())) return null;

  const rateText = info.rate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateText = info.rateUpdatedAt ? formatRateDateTime(info.rateUpdatedAt) : "";
  return `Cotação do dólar desatualizada: R$ ${rateText}${dateText ? ` em ${dateText}` : ""}`;
}
