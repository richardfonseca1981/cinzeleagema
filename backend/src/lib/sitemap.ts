import { buildPublicSlug } from "./publicSlug";
import { isEligibleForSitemap, type SitemapEligibilityInput } from "./sitemapEligibility";

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
  ];

  for (const product of eligible) {
    const slug = buildPublicSlug(product.name, product.id);
    urls.push({ path: `/catalogo/${slug}`, lastmod: toDateOnly(product.updatedAt) });
  }

  return urls;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderSitemapXml(urls: SitemapUrl[], siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const entries = urls
    .map((u) => `  <url>\n    <loc>${escapeXml(`${base}${u.path}`)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}
