import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { env } from "../lib/env";
import { getObject } from "../lib/r2";
import { extractIdSuffix, pickProductBySuffixMatch, buildPublicSlug } from "../lib/publicSlug";
import { isEligibleForSitemap } from "../lib/sitemapEligibility";
import { resolveTitle } from "../lib/catalog/content";
import {
  buildAvailableProductMeta,
  buildBreadcrumbJsonLd,
  buildCatalogMeta,
  buildHomeMeta,
  buildOrganizationJsonLd,
  buildProductJsonLd,
  buildUnavailableProductMeta,
  buildWebsiteJsonLd,
  formatWeightSizePt,
  renderPreviewHtml,
} from "../lib/seo/meta";
import { renderProductOgImage } from "../lib/seo/ogImage";

// HTML mínimo servido SÓ aos crawlers de prévia social (facebookexternalhit,
// Twitterbot, WhatsApp etc.) via rewrite condicionado por User-Agent no
// `vercel.json` — o Googlebot nunca passa por aqui (ver lib/seo/meta.ts). Sem
// view engine: o HTML é só metatags, montado por renderPreviewHtml.
export const previewRouter = Router();

const PREVIEW_CACHE_CONTROL = "public, s-maxage=600, stale-while-revalidate=86400";

const PRODUCT_INCLUDE = { images: { orderBy: { position: "asc" as const } } };

previewRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const meta = buildHomeMeta(env.PUBLIC_SITE_URL);
    const html = renderPreviewHtml(meta, [buildOrganizationJsonLd(env.PUBLIC_SITE_URL), buildWebsiteJsonLd(env.PUBLIC_SITE_URL)]);
    res.set("Cache-Control", PREVIEW_CACHE_CONTROL);
    res.type("html").send(html);
  })
);

previewRouter.get(
  "/catalogo",
  asyncHandler(async (_req, res) => {
    const meta = buildCatalogMeta(env.PUBLIC_SITE_URL);
    const breadcrumb = buildBreadcrumbJsonLd([
      { name: "Home", url: env.PUBLIC_SITE_URL },
      { name: "Catálogo", url: meta.url },
    ]);
    const html = renderPreviewHtml(meta, [breadcrumb]);
    res.set("Cache-Control", PREVIEW_CACHE_CONTROL);
    res.type("html").send(html);
  })
);

// Mesma busca por SUFIXO do id de product.routes.ts (GET /by-slug/:slugComId)
// — atende slug novo e URL antiga (cuid puro) sem distinguir formato.
previewRouter.get(
  "/catalogo/:slugComId",
  asyncHandler(async (req, res) => {
    const suffix = extractIdSuffix(req.params.slugComId);
    const candidates = await prisma.product.findMany({
      where: { id: { endsWith: suffix } },
      include: PRODUCT_INCLUDE,
    });
    const product = pickProductBySuffixMatch(candidates, req.params.slugComId);

    if (!product) {
      res.status(404);
      res.set("Cache-Control", PREVIEW_CACHE_CONTROL);
      res.type("html").send(renderPreviewHtml(buildUnavailableProductMeta(env.PUBLIC_SITE_URL, req.params.slugComId)));
      return;
    }

    const canonicalSlug = buildPublicSlug(product.name, product.id);
    const available = isEligibleForSitemap(product);

    if (!available) {
      const meta = buildUnavailableProductMeta(env.PUBLIC_SITE_URL, canonicalSlug);
      res.set("Cache-Control", PREVIEW_CACHE_CONTROL);
      res.type("html").send(renderPreviewHtml(meta));
      return;
    }

    const name = resolveTitle(product, "pt");
    const weightSize = formatWeightSizePt(Number(product.weightGrams), Number(product.sizeCm));
    const meta = buildAvailableProductMeta(env.PUBLIC_SITE_URL, { name, weightSize, canonicalSlug });

    const breadcrumb = buildBreadcrumbJsonLd([
      { name: "Home", url: env.PUBLIC_SITE_URL },
      { name: "Catálogo", url: `${env.PUBLIC_SITE_URL}/catalogo` },
      { name, url: meta.url },
    ]);

    // Preço null = "Consulte o valor" (nunca entra em carrinho/total, ver
    // product.routes.ts) — sem um preço real não há Offer/price para
    // prometer ao Google, então a peça ganha só breadcrumb, sem Product
    // JSON-LD (evita um <Offer> inventado ou ausente onde o schema exige).
    const jsonLd: unknown[] = [breadcrumb];
    if (product.price !== null) {
      const cover = product.images[0];
      jsonLd.push(
        buildProductJsonLd({
          name,
          description: product.description,
          sku: product.sku,
          price: Number(product.price),
          productImageUrl: cover?.url ?? meta.image,
          canonicalUrl: meta.url,
        })
      );
    }

    res.set("Cache-Control", PREVIEW_CACHE_CONTROL);
    res.type("html").send(renderPreviewHtml(meta, jsonLd));
  })
);

// og:image/twitter:image por peça (ver buildAvailableProductMeta) — derivado
// sob demanda da foto de capa (primeira por posição), nunca gravado no R2:
// o tráfego de crawler de prévia social é baixo e gerar na hora evita mais
// um objeto para limpar depois (mesma preocupação já registrada para outros
// derivados em CONTEXT.md "Tratamento de foto"/"autoFit").
previewRouter.get(
  "/og-image/:fileName",
  asyncHandler(async (req, res) => {
    const slugComId = req.params.fileName.replace(/\.jpe?g$/i, "");
    const suffix = extractIdSuffix(slugComId);
    const candidates = await prisma.product.findMany({
      where: { id: { endsWith: suffix } },
      include: PRODUCT_INCLUDE,
    });
    const product = pickProductBySuffixMatch(candidates, slugComId);
    const cover = product?.images[0];

    // Peça não encontrada/indisponível/sem foto: cai para o og:image estático
    // da home (mesmo arquivo usado por buildHomeMeta/buildUnavailableProductMeta)
    // em vez de devolver erro — um <meta property="og:image"> quebrado é pior
    // para a prévia social do que mostrar a logo genérica.
    if (!product || !cover || !isEligibleForSitemap(product)) {
      res.redirect(302, `${env.PUBLIC_SITE_URL}/og-default.jpg`);
      return;
    }

    try {
      const source = await getObject(cover.key);
      const jpeg = await renderProductOgImage(source);
      res.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
      res.type("jpeg").send(jpeg);
    } catch {
      // Foto corrompida/formato inesperado/R2 fora do ar: mesma rede de
      // segurança acima, nunca um 500 para o crawler.
      res.redirect(302, `${env.PUBLIC_SITE_URL}/og-default.jpg`);
    }
  })
);
