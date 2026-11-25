import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { buildFeedItems, renderGoogleFeedXml } from "../lib/feed/googleFeed";
import { env } from "../lib/env";

export const feedRouter = Router();

// Público, sem auth — mesmos campos exigidos por FeedProduct (ver
// lib/feed/googleFeed.ts) + imagens/categoria/subcategoria.
const FEED_SELECT = {
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
  weightGrams: true,
  sizeCm: true,
  images: { select: { url: true }, orderBy: { position: "asc" as const } },
  category: { select: { slug: true, name: true } },
  subcategory: { select: { name: true } },
} as const;

feedRouter.get(
  "/google.xml",
  asyncHandler(async (_req, res) => {
    const products = await prisma.product.findMany({ select: FEED_SELECT });
    const items = buildFeedItems(products, env.PUBLIC_SITE_URL);
    const xml = renderGoogleFeedXml(items, env.PUBLIC_SITE_URL);

    // Peça vendida precisa sumir do feed em minutos (perder a venda/pagar
    // comissão em dobro é pior que um sitemap desatualizado) — cache mais
    // curto que o do sitemap (10 min): 5 min de CDN + stale-while-revalidate
    // para não bloquear a resposta durante a revalidação.
    res.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    res.type("application/xml").send(xml);
  })
);
