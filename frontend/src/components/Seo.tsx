import { useEffect } from "react";

// Sem barra final — ver backend/src/lib/env.ts PUBLIC_SITE_URL (mesmo valor,
// usado para montar <loc> no sitemap). Default local cobre dev sem .env.
const SITE_URL = (import.meta.env.VITE_SITE_URL ?? "https://www.cinzeleagema.com.br").replace(/\/+$/, "");

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

interface SeoProps {
  title: string;
  description: string;
  // Caminho público, sempre começando com "/" (ex.: "/", "/catalogo",
  // "/catalogo/ametista-bruta-a1b2c3") — nunca inclui o host.
  path: string;
}

// Componente simples de SEO por página: sem lib externa (react-helmet etc.),
// só document.title + <meta name="description"> + <link rel="canonical">
// via effect. Cada página pública (Landing, Catalog, ProductDetail) monta
// isso uma vez com seus próprios title/description/path — a troca de rota
// sempre sobrescreve os mesmos três nós (nunca acumula tags duplicadas).
export function Seo({ title, description, path }: SeoProps) {
  useEffect(() => {
    document.title = title;
    setMetaDescription(description);
    setCanonicalLink(`${SITE_URL}${path}`);
  }, [title, description, path]);

  return null;
}
