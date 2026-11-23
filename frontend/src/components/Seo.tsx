import { useEffect } from "react";

// Sem barra final — ver backend/src/lib/env.ts PUBLIC_SITE_URL (mesmo valor,
// usado para montar <loc> no sitemap). Default local cobre dev sem .env.
// Exportado: lib/jsonLd.ts e as páginas públicas usam o mesmo host para
// montar as urls absolutas dos builders de JSON-LD.
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? "https://www.cinzeleagema.com.br").replace(/\/+$/, "");

function setMetaDescription(content: string) {
  let el = document.querySelector('meta[name="description"]');
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", "description");
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonicalLink(href: string) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

// Presente só quando `noindex` (peça vendida/inativa/sem estoque — ver
// lib/sitemapEligibility.ts no backend, mesma regra via `available` de
// api.getProductBySlug) — "follow" porque a navegação do site em volta
// continua válida para o crawler, só esta URL específica não deve ser
// indexada. Removido (não deixado em branco) quando `noindex` é false, para
// nunca sobrar de uma peça anterior ao trocar de rota.
function setRobotsMeta(noindex: boolean) {
  const el = document.querySelector('meta[name="robots"]');
  if (!noindex) {
    el?.remove();
    return;
  }
  if (el) {
    el.setAttribute("content", "noindex, follow");
    return;
  }
  const meta = document.createElement("meta");
  meta.setAttribute("name", "robots");
  meta.setAttribute("content", "noindex, follow");
  document.head.appendChild(meta);
}

// JSON-LD desta rodada (Organization/WebSite na Home, BreadcrumbList no
// Catálogo e na peça, Product só quando elegível — ver lib/jsonLd.ts):
// MESMA duplicação de propósito do backend (lib/seo/meta.ts, servido ao
// crawler de prévia social) — o Googlebot executa JS e nunca passa pela
// rota de preview, então precisa que a própria SPA injete o JSON-LD. Scripts
// marcados com o atributo `data-seo-jsonld` para serem removidos e
// reinseridos inteiros a cada navegação (nunca acumula de uma rota anterior).
function setJsonLd(entries: unknown[]) {
  document.querySelectorAll("script[data-seo-jsonld]").forEach((el) => el.remove());
  for (const entry of entries) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.seoJsonld = "true";
    script.textContent = JSON.stringify(entry);
    document.head.appendChild(script);
  }
}

interface SeoProps {
  title: string;
  description: string;
  // Caminho público, sempre começando com "/" (ex.: "/", "/catalogo",
  // "/catalogo/ametista-bruta-a1b2c3") — nunca inclui o host.
  path: string;
  // Objetos JSON-LD já montados (ver lib/jsonLd.ts) — opcional, página sem
  // dado estruturado nesta rodada simplesmente não passa a prop.
  jsonLd?: unknown[];
  // true só para peça indisponível (vendida/inativa/sem estoque) — nunca
  // para Home/Catálogo. Default false.
  noindex?: boolean;
}

// Componente simples de SEO por página: sem lib externa (react-helmet etc.),
// só document.title + <meta name="description"> + <link rel="canonical"> +
// JSON-LD + <meta name="robots"> via effect. Cada página pública (Landing,
// Catalog, ProductDetail) monta isso uma vez com seus próprios
// title/description/path/jsonLd — a troca de rota sempre sobrescreve os
// mesmos nós (nunca acumula tags duplicadas).
export function Seo({ title, description, path, jsonLd = [], noindex = false }: SeoProps) {
  useEffect(() => {
    document.title = title;
    setMetaDescription(description);
    setCanonicalLink(`${SITE_URL}${path}`);
    setRobotsMeta(noindex);
    setJsonLd(jsonLd);
  }, [title, description, path, noindex, jsonLd]);

  return null;
}
