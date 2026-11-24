// Captura utm_* da URL de chegada UMA VEZ por sessão (sessionStorage) — ver
// CONTEXT.md "SEO — Rodada 3: UTM". Garante atribuição de campanha correta
// mesmo quando a URL muda depois por um redirect client-side (slug canônico
// em ProductDetail.tsx) ou por uma troca de filtro no catálogo (Catalog.tsx
// setFilters reconstrói a query do zero) — nos dois casos a página muda de
// URL sem o visitante clicar em outro link, então o utm_ original seria
// perdido se dependêssemos só da barra de endereço atual no momento do
// page_view.
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const UTM_STORAGE_KEY = "cinzeleagema_utm";

export function hasUtmParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return UTM_KEYS.some((key) => params.has(key));
}

// Chamada uma vez, no bootstrap (ver main.tsx). Sem utm_ na URL de chegada,
// não faz nada — nunca sobrescreve uma campanha já guardada com "vazio".
export function captureUtmParams(search: string): void {
  if (!hasUtmParams(search)) return;
  const params = new URLSearchParams(search);
  const captured: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) captured[key] = value;
  }
  try {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(captured));
  } catch {
    // sessionStorage indisponível (modo privado etc.) — segue sem persistir a atribuição
  }
}

export function getStoredUtmParams(): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

// Usada pelo page_view (ver lib/analytics.ts trackPageView): se a URL atual
// já tem utm_ próprio, usa ela; senão, completa com a cópia guardada no
// bootstrap, sem alterar a barra de endereço — só o que é reportado ao GA4.
export function withUtmFallback(search: string): string {
  if (hasUtmParams(search)) return search;
  const stored = getStoredUtmParams();
  if (!stored) return search;

  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(stored)) {
    params.set(key, value);
  }
  const merged = params.toString();
  return merged ? `?${merged}` : search;
}
