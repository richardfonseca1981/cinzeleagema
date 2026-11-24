// Builders de JSON-LD para a SPA — DUPLICADOS de propósito em relação a
// backend/src/lib/seo/meta.ts (mesma convenção já usada em
// lib/publicSlug.ts/productSlug.ts): o HTML que o backend monta em
// routes/preview.routes.ts só é servido a crawlers de prévia social
// (facebookexternalhit, Twitterbot etc., via rewrite por User-Agent no
// vercel.json). O Googlebot executa JS e nunca passa por essa rota — por
// isso o mesmo JSON-LD precisa ser montado de novo aqui e injetado via
// components/Seo.tsx, que é o que o Google de fato indexa.
const SITE_NAME = "Cinzel e a Gema";

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

export interface ProductJsonLdDescriptionInput {
  name: string;
  categoryName: string | null;
  weightSize: string | null;
}

// MESMA lógica de backend/src/lib/seo/meta.ts buildProductJsonLdDescription
// (duplicação de propósito, ver topo do arquivo): description do Product
// JSON-LD é sempre nome + categoria (já localizada pelo chamador) +
// peso/tamanho, nunca o texto livre de product.description (repete a mesma
// frase de curadoria em várias peças). Uma linha só, sem quebra.
export function buildProductJsonLdDescription(input: ProductJsonLdDescriptionInput): string {
  const parts = [input.name, input.categoryName, input.weightSize].filter(
    (part): part is string => Boolean(part && part.trim())
  );
  return parts.join(" · ").replace(/\s*[\r\n]+\s*/g, " ");
}

// Só chamada para peça elegível (`available` de api.getProductBySlug) e com
// preço real (`price !== null` — "Consulte o valor" nunca vira Offer, mesma
// decisão do backend) — por isso `availability` é sempre InStock e
// `itemCondition` sempre NewCondition (peça única da natureza, nunca
// revendida por um dono anterior).
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
