import { buildPublicSlug } from "./publicSlug";
import { isEligibleForSitemap, type SitemapEligibilityInput } from "./sitemapEligibility";
import { escapeXml } from "./xml";

export interface SitemapProduct extends SitemapEligibilityInput {
  updatedAt: Date;
}

export interface SitemapUrl {
  path: string; // sempre começa com "/", sem o host
  lastmod: string; // "AAAA-MM-DD"
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Data da última revisão de texto das páginas legais (Política de
// Privacidade, Política de Troca e Devolução, Termos de Venda — mesmo
// UPDATED_AT fixo nos componentes Privacy.tsx/ExchangePolicy.tsx/SaleTerms.tsx
// do frontend). Não usa o lastmod do catálogo: o texto dessas páginas não
// muda quando um produto é editado.
const LEGAL_PAGES_LASTMOD = "2026-11-26";

// Única função que decide o conteúdo do sitemap: filtra pela regra de
// elegibilidade (ver sitemapEligibility.ts) e monta as entradas, incluindo
// "/" e "/catalogo" com o lastmod mais recente entre as peças elegíveis
// (proxy razoável de "quando o catálogo mudou pela última vez"; sem peça
// elegível, usa a data de agora — nunca deixa a entrada sem lastmod).
export function buildSitemapUrls(products: SitemapProduct[], now: Date = new Date()): SitemapUrl[] {
  const eligible = products.filter(isEligibleForSitemap);

  const mostRecentUpdate = eligible.reduce<Date>(
    (latest, p) => (p.updatedAt > latest ? p.updatedAt : latest),
    eligible[0]?.updatedAt ?? now
  );
  const staticLastmod = toDateOnly(mostRecentUpdate);

  const urls: SitemapUrl[] = [
    { path: "/", lastmod: staticLastmod },
    { path: "/catalogo", lastmod: staticLastmod },
    { path: "/privacidade", lastmod: LEGAL_PAGES_LASTMOD },
    { path: "/troca-e-devolucao", lastmod: LEGAL_PAGES_LASTMOD },
    { path: "/termos-de-venda", lastmod: LEGAL_PAGES_LASTMOD },
  ];

  for (const product of eligible) {
    const slug = buildPublicSlug(product.name, product.id);
    urls.push({ path: `/catalogo/${slug}`, lastmod: toDateOnly(product.updatedAt) });
  }

  return urls;
}

export function renderSitemapXml(urls: SitemapUrl[], siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const entries = urls
    .map((u) => `  <url>\n    <loc>${escapeXml(`${base}${u.path}`)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}
