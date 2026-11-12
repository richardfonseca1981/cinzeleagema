import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { buildSitemapUrls, renderSitemapXml } from "../lib/sitemap";
import { env } from "../lib/env";

export const sitemapRouter = Router();

// Público, sem auth — mesmos campos exigidos por CatalogProductContent
// (ver sitemapEligibility.ts) + os campos de disponibilidade/data.
const SITEMAP_SELECT = {
  id: true,
  name: true,
  nameEn: true,
  sku: true,
  description: true,
  descriptionEn: true,
  identificationPt: true,
  identificationEn: true,
  price: true,
  active: true,
  trackStock: true,
  stockQty: true,
  updatedAt: true,
} as const;

sitemapRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const products = await prisma.product.findMany({ select: SITEMAP_SELECT });
    const urls = buildSitemapUrls(products);
    const xml = renderSitemapXml(urls, env.PUBLIC_SITE_URL);

    // Cache de borda razoável: o catálogo não muda a cada segundo, mas o
    // admin pode editar/desativar uma peça e queremos refletir isso em
    // minutos, não em horas — 10 min de CDN (s-maxage) + um pouco de
    // stale-while-revalidate para não bloquear a resposta durante a
    // revalidação.
    res.set("Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
    res.type("application/xml").send(xml);
  })
);
