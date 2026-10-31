import { Router } from "express";
import fs from "fs";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { prisma } from "../lib/prisma";
import { startCatalogJob, getCatalogJobStatus, getCatalogJobFile } from "../lib/catalog/catalogJobs";

// Geração de catálogo em PDF pelo admin (Etapa B) — montado em
// /api/admin/catalog. Só leitura de peças/fotos: nenhuma rota aqui altera
// produto ou imagem nenhuma.
export const catalogJobRouter = Router();

catalogJobRouter.use(requireAuth);

const createJobSchema = z.object({
  // Vazio/omitido = todas as peças ativas (ver generateCatalogPdf.ts).
  productIds: z.array(z.string().min(1)).optional(),
  language: z.enum(["pt", "en"]),
  showPrice: z.boolean(),
  showRef: z.boolean(),
  includeCategoryDividers: z.boolean().optional(),
  includeContactPage: z.boolean(),
  quality: z.enum(["standard", "light"]),
});

// POST /jobs — dispara a geração em segundo plano e devolve o id na hora
// (202): o catálogo completo leva dezenas de segundos, mais do que o limite
// de requisição do Railway/Vercel. Só uma geração por vez (ver
// catalogJobs.ts) — 409 com mensagem clara se já houver uma rodando.
catalogJobRouter.post(
  "/jobs",
  asyncHandler(async (req, res) => {
    const data = createJobSchema.parse(req.body);
    const { id } = startCatalogJob({
      productIds: data.productIds && data.productIds.length > 0 ? data.productIds : undefined,
      language: data.language,
      showPrice: data.showPrice,
      showRef: data.showRef,
      includeCategoryDividers: data.includeCategoryDividers,
      includeContactPage: data.includeContactPage,
      quality: data.quality,
    });
    res.status(202).json({ id });
  })
);

// GET /jobs/:id — status/progresso para o polling da tela do admin.
catalogJobRouter.get(
  "/jobs/:id",
  asyncHandler(async (req, res) => {
    const status = getCatalogJobStatus(req.params.id);
    if (!status) throw new HttpError(404, "Geração não encontrada (pode ter expirado — jobs somem 30 min depois de prontos)");
    res.json(status);
  })
);

// Mesmo fuso/formato de data dos outros exports do admin (ver
// productExport.routes.ts saoPauloDateStamp) — duplicado aqui (função
// pequena e autocontida) em vez de importar de um arquivo de rotas.
function saoPauloDateStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(
    date
  );
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// GET /jobs/:id/download — stream do PDF já pronto.
catalogJobRouter.get(
  "/jobs/:id/download",
  asyncHandler(async (req, res) => {
    const file = getCatalogJobFile(req.params.id);
    if (!file) {
      const status = getCatalogJobStatus(req.params.id);
      if (!status) throw new HttpError(404, "Geração não encontrada (pode ter expirado)");
      throw new HttpError(409, "Esta geração ainda não terminou (ou terminou com erro) — confira o status antes de baixar.");
    }

    const filename = `catalogo-cinzel-${file.language}-${saoPauloDateStamp(new Date())}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    fs.createReadStream(file.filePath).pipe(res);
  })
);

// GET /options — categorias com pelo menos uma peça ATIVA (para os filtros
// da tela de seleção de peças) — categorias vazias ficam de fora.
catalogJobRouter.get(
  "/options",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: { position: "asc" },
      select: { id: true, name: true, _count: { select: { products: { where: { active: true } } } } },
    });
    const withActivePieces = categories
      .filter((category) => category._count.products > 0)
      .map((category) => ({ id: category.id, name: category.name, count: category._count.products }));
    res.json({ categories: withActivePieces });
  })
);
