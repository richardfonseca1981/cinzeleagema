import { RealMercadoLivrePublisherClient, type MercadoLivrePublisherClient } from "./publisherClient";

// Fase 1B etapa 5 — ponto único de acesso ao cliente usado pelo fluxo REAL de
// publicação (rota POST /publish/:productId, modo "real"). Por padrão devolve
// um RealMercadoLivrePublisherClient singleton (reaproveitado entre chamadas,
// sem estado próprio relevante). Testes trocam por um
// FakeMercadoLivrePublisherClient via setMercadoLivrePublisherClientForTests
// para exercitar o fluxo real (idempotência, falhas, reconciliação) sem
// nenhuma chamada de rede — nunca precisam de credenciais ML_* reais, só
// ML_PUBLISH_ENABLED=true (ver mercadoLivre.routes.ts).
//
// O modo dry-run NUNCA passa por aqui: ele instancia seu próprio
// FakeMercadoLivrePublisherClient local, descartável a cada chamada (ver
// mercadoLivre.routes.ts) — não compartilha estado com o fluxo real nem com
// outros dry-runs.
let override: MercadoLivrePublisherClient | null = null;
let realSingleton: MercadoLivrePublisherClient | null = null;

export function getMercadoLivrePublisherClient(): MercadoLivrePublisherClient {
  if (override) return override;
  if (!realSingleton) realSingleton = new RealMercadoLivrePublisherClient();
  return realSingleton;
}

export function setMercadoLivrePublisherClientForTests(client: MercadoLivrePublisherClient | null): void {
  override = client;
}
