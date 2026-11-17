import type { MercadoLivreItemStatus } from "./publisherClient";

// Fase 1B etapa 6 — transições de status de um anúncio JÁ publicado
// (pausar/reativar/encerrar). Função pura, sem I/O, única fonte de verdade
// reaproveitada tanto pelas rotas de ação individual quanto por "pausar
// tudo" — nunca duas implementações divergentes da mesma regra.
export type ListingLifecycleAction = "pause" | "reactivate" | "close";

export type ListingTransitionBlockReason = "already_closed" | "needs_reconciliation" | "invalid_transition";

const VALID_FROM_STATUS: Record<ListingLifecycleAction, readonly string[]> = {
  pause: ["active"],
  reactivate: ["paused"],
  close: ["active", "paused"],
};

const TARGET_STATUS: Record<ListingLifecycleAction, MercadoLivreItemStatus> = {
  pause: "paused",
  reactivate: "active",
  close: "closed",
};

export function getListingActionTargetStatus(action: ListingLifecycleAction): MercadoLivreItemStatus {
  return TARGET_STATUS[action];
}

// "closed" é terminal — nenhuma ação é válida depois disso (checado ANTES
// das transições específicas, pra nunca ser mascarado por
// "invalid_transition"). "publishing"/"error" significam que o estado real
// no Mercado Livre é desconhecido/ambíguo (POST /items nunca confirmou
// sucesso, ou um erro anterior não resolvido) — pausar/reativar/encerrar
// nesse estado arriscaria mandar um PUT pra um item que talvez nem exista
// ainda; a reconciliação (findItemsBySku) é o caminho certo pra resolver
// isso primeiro, pra QUALQUER uma das 3 ações (não só pausar).
//
// Reativar uma peça já "active", ou pausar uma já "paused", é reportado
// como "invalid_transition" (não um no-op silencioso de sucesso) — decisão
// deliberada: mascarar isso como sucesso esconderia um possível bug do lado
// de quem chama (ex.: o admin clicando duas vezes sem perceber que já
// aplicou).
export function getTransitionBlockReason(
  currentStatus: string,
  action: ListingLifecycleAction
): ListingTransitionBlockReason | null {
  if (currentStatus === "closed") return "already_closed";
  if (currentStatus === "publishing" || currentStatus === "error") return "needs_reconciliation";
  if (!VALID_FROM_STATUS[action].includes(currentStatus)) return "invalid_transition";
  return null;
}
