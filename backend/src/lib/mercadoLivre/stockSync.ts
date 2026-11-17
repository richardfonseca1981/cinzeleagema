import type { SoldChannel } from "../../schemas/product.schema";

// Fase 1B etapa 7 — reconciliação de estoque site -> Mercado Livre. Função
// PURA (sem nenhuma chamada de rede/banco): decide o que a rota de "marcar
// vendida" deve fazer com o anúncio ML da peça, dado o canal da venda e o
// status ATUAL (local) do anúncio — nunca decide sozinha chamando a API,
// só diz "o que fazer" para quem chama (product.routes.ts) executar.
export type MarkSoldPauseDecision = "not_applicable" | "already_paused" | "pause_needed";

// "mercadolivre" como canal NUNCA tenta pausar por aqui — a venda já
// aconteceu NO Mercado Livre, que encerra/pausa o próprio anúncio do lado
// dele (SUPOSIÇÃO não verificada, ver CONTEXT.md "débitos" desta etapa).
// Sem nenhum anúncio (`listingStatus` null — peça nunca publicada, ou conta
// desconectada) também não há o que fazer. "paused" já está parado —
// idempotente, nunca chama a API de novo à toa. "publishing"/"error"/
// "closed" ficam de fora de propósito: o estado real no Mercado Livre é
// desconhecido/ambíguo (publishing/error, precisa de reconciliação antes) ou
// já terminal (closed) — tentar pausar automaticamente nesses casos
// arriscaria mais do que ajudar. Só "active" é seguro o bastante pra pausar
// sem intervenção manual.
export function decideMarkSoldPauseAction(channel: SoldChannel, listingStatus: string | null): MarkSoldPauseDecision {
  if (channel === "mercadolivre") return "not_applicable";
  if (listingStatus === null) return "not_applicable";
  if (listingStatus === "active") return "pause_needed";
  if (listingStatus === "paused") return "already_paused";
  return "not_applicable";
}
