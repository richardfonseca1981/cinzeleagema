// Metatags (Open Graph/Twitter) e JSON-LD servidos ao HTML mínimo de
// `routes/preview.routes.ts` — a página que os crawlers de prévia social
// (WhatsApp, facebookexternalhit, Twitterbot etc., ver vercel.json) recebem
// no lugar da SPA. O Googlebot NÃO passa por aqui: o mesmo JSON-LD é
// montado de novo no FRONTEND (frontend/src/lib/jsonLd.ts, duplicação
// intencional — mesma convenção já usada em lib/publicSlug.ts/productSlug.ts)
// e injetado via Seo.tsx, porque o Google executa JS e a SPA é a fonte real.
export const SITE_NAME = "Cinzel e a Gema";

// og:type fica sempre "website" nesta rodada — decisão explícita (ver
// CONTEXT.md "SEO — Rodada 2"): "product" exigiria manter price/availability
// sincronizados em dois formatos (OG e JSON-LD) para o mesmo dado; o preço
// real já vai em JSON-LD (Product), que é o que o Google de fato usa para
// rich results.
const OG_TYPE = "website";

export interface MetaTags {
  title: string;
  description: string;
  url: string;
  image: string;
  noindex: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "</script" dentro do JSON-LD fecharia a tag prematuramente — mesma defesa
// padrão de qualquer JSON embutido em HTML (nunca ocorre com os dados reais
// da peça, mas a entrada não é validada antes daqui).
function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildHomeMeta(siteUrl: string): MetaTags {
  return {
    title: `${SITE_NAME} — Pedras Preciosas`,
    description:
      "Cinzel e a Gema — curadoria e comercialização de pedras preciosas, com foco em qualidade e procedência.",
    url: siteUrl,
    image: `${siteUrl}/og-default.jpg`,
    noindex: false,
  };
}

export function buildCatalogMeta(siteUrl: string): MetaTags {
  return {
    title: `Catálogo de pedras preciosas — ${SITE_NAME}`,
    description:
      "Veja o catálogo completo de pedras preciosas da Cinzel e a Gema: peso, tamanho, categoria e disponibilidade de cada peça.",
    url: `${siteUrl}/catalogo`,
    image: `${siteUrl}/og-default.jpg`,
    noindex: false,
  };
}

// Mesma lógica de frontend/src/lib/format.ts formatWeightSize, duplicada de
// propósito (mesma convenção de publicSlug.ts/productSlug.ts) — aqui só
// pt-BR, já que o preview servido a crawlers (routes/preview.routes.ts) não
// tem i18n (ver CONTEXT.md "SEO — Rodada 1": idioma continua só localStorage,
// nunca visível ao Googlebot/crawlers de prévia social).
export function formatWeightSizePt(weightGrams: string | number, sizeCm: string | number): string | null {
  const grams = Number(weightGrams);
  const cm = Number(sizeCm);

  const weightLabel =
    grams > 0
      ? grams >= 1000
        ? `${(grams / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}kg`
        : `${grams.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}g`
      : null;

  const sizeLabel = cm > 0 ? `${cm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}cm` : null;

  if (!weightLabel && !sizeLabel) return null;
  return [weightLabel, sizeLabel].filter(Boolean).join(" · ");
}

export interface AvailableProductMetaInput {
  name: string;
  weightSize: string | null;
  canonicalSlug: string;
}

// Só chamada para peça elegível (ver isEligibleForSitemap) — mesmo texto de
// description do Seo.tsx do frontend (lib/format.ts + locales pt-BR "seo.product"),
// sem nenhuma afirmação sobre cor/tratamento (mesma razão da Rodada 1: ver
// CONTEXT.md, pendência enhance_color).
export function buildAvailableProductMeta(siteUrl: string, input: AvailableProductMetaInput): MetaTags {
  const url = `${siteUrl}/catalogo/${input.canonicalSlug}`;
  const description = input.weightSize
    ? `${input.name} — pedra preciosa à venda na ${SITE_NAME}. Peso e tamanho: ${input.weightSize}.`
    : `${input.name} — pedra preciosa à venda na ${SITE_NAME}.`;
  return {
    title: `${input.name} — ${SITE_NAME}`,
    description,
    url,
    image: `${siteUrl}/api/preview/og-image/${input.canonicalSlug}.jpg`,
    noindex: false,
  };
}

// Peça vendida/inativa/sem estoque: metatags GENÉRICAS (mesmo conteúdo da
// home), sem preço, sem Product JSON-LD — decisão do usuário (ver CONTEXT.md)
// para não promover em prévia social algo que não está mais à venda. `url`
// continua sendo a URL real da peça (é essa página que está sendo
// compartilhada), só o conteúdo é genérico.
export function buildUnavailableProductMeta(siteUrl: string, canonicalSlug: string): MetaTags {
  const home = buildHomeMeta(siteUrl);
  return { ...home, url: `${siteUrl}/catalogo/${canonicalSlug}`, noindex: true };
}

export function buildOrganizationJsonLd(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: siteUrl,
    logo: `${siteUrl}/og-default.jpg`,
  };
}

export function buildWebsiteJsonLd(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl,
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export interface ProductJsonLdInput {
  name: string;
  description: string | null;
  sku: string | null;
  price: number;
  productImageUrl: string;
  canonicalUrl: string;
}

// Só chamada para peça elegível — por isso `availability` é sempre InStock
// aqui: a própria elegibilidade (isEligibleForSitemap) já excluiu peça
// inativa e peça com controle de estoque zerado antes de chegar neste ponto.
// `itemCondition` é sempre NewCondition: peça única da natureza, nunca
// revendida por um dono anterior.
export function buildProductJsonLd(input: ProductJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description ?? undefined,
    sku: input.sku ?? undefined,
    image: [input.productImageUrl],
    offers: {
      "@type": "Offer",
      url: input.canonicalUrl,
      priceCurrency: "BRL",
      price: input.price,
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
}

export function renderPreviewHtml(meta: MetaTags, jsonLd: unknown[] = []): string {
  const jsonLdScripts = jsonLd
    .map((entry) => `    <script type="application/ld+json">${serializeJsonLd(entry)}</script>`)
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <link rel="canonical" href="${escapeHtml(meta.url)}" />
${meta.noindex ? '    <meta name="robots" content="noindex, follow" />\n' : ""}    <meta property="og:type" content="${OG_TYPE}" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:url" content="${escapeHtml(meta.url)}" />
    <meta property="og:image" content="${escapeHtml(meta.image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
    <meta name="twitter:image" content="${escapeHtml(meta.image)}" />
${jsonLdScripts}
  </head>
  <body></body>
</html>
`;
}
