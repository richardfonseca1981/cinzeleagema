// Log estruturado compartilhado por toda ação relacionada ao Mercado Livre
// (publicar/reconciliar/pausar/reativar/encerrar/sincronizar/marcar vendida)
// — peça, modo (ou ação) e resultado, nunca payload completo nem qualquer
// token/credencial.
export function logMercadoLivreAttempt(entry: { productId: string; mode: string; result: string }): void {
  console.info(JSON.stringify({ event: "ml_action_attempt", ...entry, at: new Date().toISOString() }));
}
