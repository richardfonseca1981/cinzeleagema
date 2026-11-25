import { resolveBodyText, resolveTitle } from "../catalog/content";
import { buildPublicSlug } from "../publicSlug";
import { escapeXml } from "../xml";
import { evaluateFeedEligibility, type FeedEligibilityInput } from "./feedEligibility";
import { GOOGLE_PRODUCT_CATEGORY_BY_CATEGORY_SLUG } from "./googleProductCategoryMap";

// Sem marca própria por peça (cada peça é um item único, não industrializado
// — ver CONTEXT.md) — "brand" do Google é preenchido com o nome da loja,
// prática padrão para produto não industrializado/sem marca de fábrica.
const BRAND_NAME = "Cinzel e a Gema";

// Limite documentado do Google para <g:additional_image_link>: até 10 URLs
// além da principal (<g:image_link>).
const MAX_ADDITIONAL_IMAGES = 10;

export interface FeedCategory {
  slug: string;
  name: string;
}

export interface FeedSubcategory {
  name: string;
}

export interface FeedProduct extends FeedEligibilityInput {
  weightGrams: unknown; // Decimal do Prisma ou já convertido — 0 = "não informado".
  sizeCm: unknown; // Decimal do Prisma ou já convertido — 0 = "não informado".
  category: FeedCategory | null;
  subcategory: FeedSubcategory | null;
}

export interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImageLinks: string[];
  priceBRL: number;
  weightKg: number | null;
  productType: string | null;
  googleProductCategory: string | null;
  customLabel0: string | null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

// Mesmo formato de tamanho já usado no site (frontend/src/lib/format.ts
// formatWeightSize / backend/src/lib/seo/meta.ts formatWeightSizePt): número
// + "cm" SEM espaço entre os dois, separador decimal pt-BR. Duplicado de
// propósito aqui (mesma convenção de publicSlug.ts/productSlug.ts — nunca
// importar essa formatação entre camadas) porque o título do feed precisa só
// do tamanho (a descrição usa formatWeightSizePt, que já combina peso+tamanho).
function formatSizeCmPt(cm: number): string {
  return `${cm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}cm`;
}

// Acrescenta a medida ao título quando houver `sizeCm` real (> 0) — "Título –
// 10cm". Sem medida, devolve o título como veio (nunca inventa "– 0cm").
function appendSizeToTitle(title: string, sizeCmNumber: number): string {
  return sizeCmNumber > 0 ? `${title} – ${formatSizeCmPt(sizeCmNumber)}` : title;
}

// Única função que decide o CONTEÚDO de um item do feed a partir de uma
// peça já elegível (ver evaluateFeedEligibility) — nunca filtra de novo
// aqui, só transforma. Chamador garante que só passa peças elegíveis
// (buildFeedItems abaixo faz esse filtro).
export function buildFeedItem(product: FeedProduct, siteUrl: string): FeedItem {
  const base = siteUrl.replace(/\/+$/, "");
  const baseTitle = resolveTitle(product, "pt");
  const body = resolveBodyText(product, "pt", baseTitle);
  const slug = buildPublicSlug(product.name, product.id);

  const [cover, ...rest] = product.images;

  const weightGramsNumber = Number(product.weightGrams);
  const weightKg = weightGramsNumber > 0 ? weightGramsNumber / 1000 : null;
  const sizeCmNumber = Number(product.sizeCm);
  const title = appendSizeToTitle(baseTitle, sizeCmNumber);

  const categorySlug = product.category?.slug ?? null;
  const categoryMapping = categorySlug ? GOOGLE_PRODUCT_CATEGORY_BY_CATEGORY_SLUG[categorySlug] ?? null : null;

  const productType = product.category
    ? product.subcategory
      ? `${product.category.name} > ${product.subcategory.name}`
      : product.category.name
    : null;

  return {
    id: product.id,
    title: truncate(title, 150),
    description: truncate(body?.text ?? baseTitle, 5000),
    link: `${base}/catalogo/${slug}`,
    imageLink: cover.url,
    additionalImageLinks: rest.slice(0, MAX_ADDITIONAL_IMAGES).map((image) => image.url),
    priceBRL: Number(product.price),
    weightKg,
    productType,
    googleProductCategory: categoryMapping?.path ?? null,
    customLabel0: categorySlug,
  };
}

// Filtra pela regra de elegibilidade (evaluateFeedEligibility) e monta os
// itens das peças que sobraram — espelha buildSitemapUrls (lib/sitemap.ts).
export function buildFeedItems(products: FeedProduct[], siteUrl: string): FeedItem[] {
  return products.filter((p) => evaluateFeedEligibility(p).eligible).map((p) => buildFeedItem(p, siteUrl));
}

function renderItemXml(item: FeedItem): string {
  const additionalImages = item.additionalImageLinks
    .map((url) => `    <g:additional_image_link>${escapeXml(url)}</g:additional_image_link>`)
    .join("\n");

  const lines = [
    "  <item>",
    `    <g:id>${escapeXml(item.id)}</g:id>`,
    `    <title>${escapeXml(item.title)}</title>`,
    `    <description>${escapeXml(item.description)}</description>`,
    `    <link>${escapeXml(item.link)}</link>`,
    `    <g:image_link>${escapeXml(item.imageLink)}</g:image_link>`,
    ...(additionalImages ? [additionalImages] : []),
    "    <g:availability>in stock</g:availability>",
    `    <g:price>${item.priceBRL.toFixed(2)} BRL</g:price>`,
    "    <g:condition>new</g:condition>",
    `    <g:brand>${escapeXml(BRAND_NAME)}</g:brand>`,
    "    <g:identifier_exists>false</g:identifier_exists>",
    ...(item.googleProductCategory ? [`    <g:google_product_category>${escapeXml(item.googleProductCategory)}</g:google_product_category>`] : []),
    ...(item.productType ? [`    <g:product_type>${escapeXml(item.productType)}</g:product_type>`] : []),
    ...(item.customLabel0 ? [`    <g:custom_label_0>${escapeXml(item.customLabel0)}</g:custom_label_0>`] : []),
    ...(item.weightKg !== null ? [`    <g:shipping_weight>${item.weightKg.toFixed(3)} kg</g:shipping_weight>`] : []),
    "  </item>",
  ];

  return lines.join("\n");
}

export function renderGoogleFeedXml(items: FeedItem[], siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const itemsXml = items.map(renderItemXml).join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n` +
    `<channel>\n` +
    `  <title>${escapeXml(BRAND_NAME)}</title>\n` +
    `  <link>${escapeXml(base)}</link>\n` +
    `  <description>Catálogo de pedras e cristais únicos — ${escapeXml(BRAND_NAME)}</description>\n` +
    `${itemsXml}\n` +
    `</channel>\n` +
    `</rss>\n`
  );
}
