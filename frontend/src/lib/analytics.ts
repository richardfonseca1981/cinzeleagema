// GA4 via gtag.js, carregado só em produção, com Consent Mode v2 — ver
// CONTEXT.md "SEO — Rodada 3" para a decisão completa (por que
// send_page_view:false, por que /admin nunca é medido, por que o
// consentimento começa negado). Sem lib externa (react-ga4 etc.), mesma
// convenção já usada no resto do SEO (ver components/Seo.tsx).
import { withUtmFallback } from "./utm";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Sem valor padrão de propósito: só liga com a env var presente (ver
// shouldLoadAnalytics) — nunca com um ID genérico/placeholder.
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

const ADMIN_PATH_PREFIXES = ["/admin", "/login"];

// /admin (painel interno) e /login nunca são medidos, mesmo que o script já
// tenha carregado numa página pública antes — ver CONTEXT.md.
export function isAdminPath(pathname: string): boolean {
  return ADMIN_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function shouldLoadAnalytics(input: { prod: boolean; measurementId: string | undefined }): boolean {
  return input.prod && Boolean(input.measurementId);
}

let initialized = false;

// Carrega o gtag.js e registra o Consent Mode v2 ANTES de qualquer config —
// analytics_storage/ad_storage começam NEGADOS; só viram "granted" depois do
// aceite no banner (ver lib/consent.tsx updateConsent). send_page_view:false
// porque o page_view é disparado manualmente pelo RouteTracker a cada troca
// de rota do React Router — sem isso, duplicaria (um do carregamento do
// script, um por navegação).
export function initAnalytics(): void {
  if (initialized) return;
  if (!shouldLoadAnalytics({ prod: import.meta.env.PROD, measurementId: GA_MEASUREMENT_ID })) return;
  initialized = true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };

  window.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied" });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
}

// Chamada pelo ConsentProvider (ver lib/consent.tsx) quando o visitante
// aceita/rejeita, ou quando já havia uma escolha salva — nunca impede o
// gtag de rodar, só controla se ele pode usar cookie/identificador (ver
// página /privacidade). No-op se o script nem chegou a carregar (dev/test,
// ou sem VITE_GA_MEASUREMENT_ID).
export function updateConsent(granted: boolean): void {
  if (!window.gtag) return;
  const value = granted ? "granted" : "denied";
  window.gtag("consent", "update", { analytics_storage: value, ad_storage: value });
}

function buildPageLocation(pathname: string, search: string): string {
  return `${window.location.origin}${pathname}${search}`;
}

// page_view manual (ver initAnalytics) — nunca para rota admin. Quando a URL
// atual não tem utm_* (redirect de slug canônico, filtro do catálogo etc.,
// ver lib/utm.ts), completa com a cópia capturada no primeiro load da
// sessão, pra não perder a atribuição de campanha.
export function trackPageView(pathname: string, search: string): void {
  if (!window.gtag || isAdminPath(pathname)) return;
  const effectiveSearch = withUtmFallback(search);
  window.gtag("event", "page_view", {
    page_path: pathname,
    page_location: buildPageLocation(pathname, effectiveSearch),
    page_title: document.title,
  });
}

// Disparo genérico de evento — mesmo guard de rota admin do page_view.
// `params` nunca deve conter dado pessoal (CEP completo, nome, telefone) —
// ver CONTEXT.md "SEO — Rodada 3" para a lista de eventos aprovados.
export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  if (!window.gtag || isAdminPath(window.location.pathname)) return;
  window.gtag("event", name, params);
}
