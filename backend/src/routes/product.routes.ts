import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { createProductSchema, listProductsQuerySchema, updateProductSchema } from "../schemas/product.schema";
import { isPortrait916 } from "../lib/photoFormat";
import { filterProductIdsBySearch } from "../lib/productSearch";
import { Prisma } from "@prisma/client";
import { filesSafeToRemove, removeFiles } from "../lib/photoFiles";
import { translateAndSaveProduct, translateProductInBackground } from "../lib/productTranslation";
import { generateUniqueSlug } from "../lib/productSlug";
import { buildOrderBy, DEFAULT_ORDER_BY, isSplitSort, splitField, splitOrderBy, splitWindow } from "../lib/productSort";

export const productRouter = Router();

// Mesmo formato em TODAS as rotas que devolvem uma peça (a lista do admin
// troca a linha pela resposta; sem "images" a coluna de foto quebrava).
const PRODUCT_INCLUDE = { images: { orderBy: { position: "asc" as const } }, category: true, subcategory: true };

// GET fica público: alimenta o catálogo do site (navegação/filtro por
// categoria e página de detalhe). Só as rotas que alteram dados exigem login.

// Campos de identificação de catálogo por IA (triagem visual, nunca um laudo)
// nunca saem nas rotas públicas — mesmo o GET /:id, usado pelo formulário do
// admin para carregar a peça, é público (sem requireAuth). O admin lê o
// estado salvo da identificação por uma rota autenticada separada (ver
// productIdentification.routes.ts).
const IDENTIFICATION_FIELDS = [
  "identificationPt",
  "identificationEn",
  "identificationConfidence",
  "identificationTreatment",
  "identificationNote",
] as const;

function omitIdentification<T extends Record<string, unknown>>(product: T): Omit<T, (typeof IDENTIFICATION_FIELDS)[number]> {
  const clone = { ...product };
  for (const field of IDENTIFICATION_FIELDS) delete clone[field];
  return clone;
}

// Valida que a categoria existe e que a subcategoria (quando informada ou
// exigida) pertence a ela. Retorna o subcategoryId final a ser persistido
// (null quando a categoria não tem subcategorias).
async function resolveSubcategoryId(categoryId: string | null | undefined, subcategoryId: string | null | undefined) {
  // Peça sem categoria: nunca tem subcategoria (não há o que validar contra).
  if (!categoryId) return null;

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { subcategories: true },
  });
  if (!category) throw new HttpError(400, "Categoria inválida");

  if (category.subcategories.length === 0) {
    return null;
  }

  if (!subcategoryId) {
    throw new HttpError(400, "Subcategoria é obrigatória para esta categoria");
  }
  if (!category.subcategories.some((s) => s.id === subcategoryId)) {
    throw new HttpError(400, "Subcategoria inválida para a categoria selecionada");
  }
  return subcategoryId;
}

productRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { active, categoryId, subcategoryId, q, page, pageSize, sort } = listProductsQuerySchema.parse(req.query);

    const baseWhere = {
      ...(active === undefined ? {} : { active }),
      ...(categoryId ? { categoryId } : {}),
      ...(subcategoryId ? { subcategoryId } : {}),
    };

    // Busca por nome/nome em inglês/SKU em memória (ver lib/productSearch.ts):
    // sem extensão `unaccent` do Postgres, buscamos só os campos de texto das
    // peças que já passam nos demais filtros e filtramos por palavra (acento,
    // hífen e maiúsculas normalizados). O "where" da consulta principal usa o
    // conjunto de ids encontrado — total (count), paginação e ordenação
    // continuam exatamente como sem "q".
    let where: typeof baseWhere & { id?: { in: string[] } } = baseWhere;
    if (q) {
      const candidates = await prisma.product.findMany({
        where: baseWhere,
        select: { id: true, name: true, nameEn: true, sku: true },
      });
      where = { ...baseWhere, id: { in: filterProductIdsBySearch(candidates, q) } };
    }

    const include = { images: { orderBy: { position: "asc" as const } }, category: true, subcategory: true };
    const skip = (page - 1) * pageSize;

    let items;
    let total;

    if (isSplitSort(sort)) {
      // size_asc/weight_asc: sizeCm/weightGrams = 0 é "não informado" e
      // precisa ficar no fim mesmo no crescente — diferente de "price", que é
      // Decimal nullable e aceita `nulls: "last"` nativo do Prisma. Paginamos
      // dois conjuntos em sequência (informadas asc, depois não informadas na
      // ordem padrão) com splitWindow calculando a janela de cada um sem
      // pular nem repetir peças na fronteira entre eles.
      const field = splitField(sort);
      const informedWhere = { ...where, [field]: { gt: 0 } };
      const uninformedWhere = { ...where, [field]: { lte: 0 } };

      const [firstCount, totalCount] = await Promise.all([
        prisma.product.count({ where: informedWhere }),
        prisma.product.count({ where }),
      ]);
      const { firstSkip, firstTake, secondSkip, secondTake } = splitWindow(skip, pageSize, firstCount);

      const [firstItems, secondItems] = await Promise.all([
        firstTake > 0
          ? prisma.product.findMany({
              where: informedWhere,
              include,
              orderBy: splitOrderBy(field),
              skip: firstSkip,
              take: firstTake,
            })
          : [],
        secondTake > 0
          ? prisma.product.findMany({
              where: uninformedWhere,
              include,
              orderBy: DEFAULT_ORDER_BY,
              skip: secondSkip,
              take: secondTake,
            })
          : [],
      ]);

      items = [...firstItems, ...secondItems];
      total = totalCount;
    } else {
      [items, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include,
          orderBy: buildOrderBy(sort),
          skip,
          take: pageSize,
        }),
        prisma.product.count({ where }),
      ]);
    }

    res.json({ items: items.map(omitIdentification), total, page, pageSize });
  })
);

// Admin: quantas peças já têm a foto principal (capa) em 9:16. Foto sem
// dimensões gravadas (antiga) ou peça sem foto contam como "a trocar".
productRouter.get(
  "/photo-stats",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const products = await prisma.product.findMany({
      select: { images: { orderBy: { position: "asc" }, take: 1, select: { width: true, height: true } } },
    });
    const portrait = products.filter((p) => {
      const cover = p.images[0];
      return Boolean(cover?.width && cover?.height && isPortrait916(cover.width, cover.height));
    }).length;
    res.json({ total: products.length, portrait });
  })
);

productRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { images: { orderBy: { position: "asc" } }, category: true, subcategory: true },
    });
    if (!product) throw new HttpError(404, "Produto não encontrado");
    res.json(omitIdentification(product));
  })
);

productRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = createProductSchema.parse(req.body);

    if (!data.trackStock) {
      data.stockQty = null;
    }
    data.subcategoryId = await resolveSubcategoryId(data.categoryId, data.subcategoryId);

    const slug = await generateUniqueSlug(data.name);

    // Peça nova entra no topo da ordem definida pelo admin (min - 1).
    const product = await prisma.$transaction(async (tx) => {
      const { _min } = await tx.product.aggregate({ _min: { sortOrder: true } });
      const sortOrder = (_min.sortOrder ?? 1) - 1;
      return tx.product.create({
        data: { ...data, slug, sortOrder },
        include: { images: true, category: true, subcategory: true },
      });
    });
    res.status(201).json(product);

    // Produto novo: sempre traduz, EXCETO sem nome (nada a traduzir). Não
    // bloqueia a resposta nem falha o cadastro se a tradução der errado (ver
    // translateProductInBackground).
    if (product.name) {
      translateProductInBackground(product.id, product.name, product.description);
    }
  })
);

productRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = updateProductSchema.parse(req.body);

    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Produto não encontrado");

    if (data.trackStock === false) {
      data.stockQty = null;
    }

    if (data.categoryId !== undefined || data.subcategoryId !== undefined) {
      // "??" trocaria null (categoria removida de propósito) pelo valor
      // antigo — precisa distinguir "não veio no payload" (undefined) de
      // "veio null" (limpar), igual já era feito com subcategoryId abaixo.
      const categoryId = data.categoryId !== undefined ? data.categoryId : existing.categoryId;
      const subcategoryId = data.subcategoryId !== undefined ? data.subcategoryId : existing.subcategoryId;
      data.subcategoryId = await resolveSubcategoryId(categoryId, subcategoryId);
    }

    const nameChanged = data.name !== undefined && data.name !== existing.name;
    const descriptionChanged = data.description !== undefined && data.description !== existing.description;

    // Campo ENVIADO como null (limpo de propósito no formulário) é diferente
    // de campo não enviado (mantém o valor salvo) — essa distinção já vem do
    // próprio "data" do zod (chave ausente vs. null). Nome/descrição limpos
    // levam a tradução correspondente junto, na MESMA escrita: não dá pra
    // depender da retradução em background (best-effort, só roda com
    // ANTHROPIC_API_KEY configurada, e é assíncrona demais — a resposta desta
    // requisição já teria voltado com a tradução antiga).
    const nameCleared = data.name !== undefined && data.name === null;
    const descriptionCleared = data.description !== undefined && data.description === null;

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(nameCleared ? { nameEn: null } : {}),
        ...(descriptionCleared ? { descriptionEn: null } : {}),
      },
      include: { images: { orderBy: { position: "asc" } }, category: true, subcategory: true },
    });
    res.json(product);

    // Só retraduz quando nome ou descrição de fato mudaram — evita chamar a
    // IA à toa em edições que não tocam nesses campos (ex: só preço). Sem
    // nome (removido ou nunca preenchido) não há o que traduzir.
    if ((nameChanged || descriptionChanged) && product.name) {
      translateProductInBackground(product.id, product.name, product.description);
    }
  })
);

productRouter.post(
  "/:id/retranslate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw new HttpError(404, "Produto não encontrado");
    if (!product.name) throw new HttpError(400, "Esta peça não tem nome cadastrado — não há o que traduzir.");

    const updated = await translateAndSaveProduct(product.id, product.name, product.description);
    if (!updated) throw new HttpError(502, "Não foi possível traduzir o produto agora, tente novamente");

    // Mesmo formato das demais rotas (com fotos e categorias).
    res.json(await prisma.product.findUnique({ where: { id: product.id }, include: PRODUCT_INCLUDE }));
  })
);

productRouter.patch(
  "/:id/deactivate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { active: false },
      include: PRODUCT_INCLUDE,
    });
    res.json(product);
  })
);

productRouter.patch(
  "/:id/activate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { active: true },
      include: PRODUCT_INCLUDE,
    });
    res.json(product);
  })
);

// Exclusão DEFINITIVA de uma peça (manual, uma por vez, só admin). Só peça
// inativa e sem nenhuma ligação com pedidos/histórico. Relações do Product no
// banco: apenas ProductImage (fotos, onDelete Cascade); traduções são colunas
// do próprio Product (nameEn/descriptionEn). Pedidos não são gravados no banco
// (o POST /api/orders só encaminha ao FluxioDesk); se um dia houver tabela que
// aponte para Product sem cascade, o banco recusa (P2003) e respondemos 409.
productRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { images: true } });
    if (!product) throw new HttpError(404, "Produto não encontrado");
    if (product.active) {
      throw new HttpError(409, "Desative a peça antes de excluir.");
    }

    // Arquivos que só estas fotos usam (conferido ANTES de apagar os registros).
    const filesToRemove = await filesSafeToRemove(product.images);

    try {
      // Tudo ou nada: fotos e peça saem juntas.
      await prisma.$transaction([
        prisma.productImage.deleteMany({ where: { productId: product.id } }),
        prisma.product.delete({ where: { id: product.id } }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        throw new HttpError(409, "Esta peça aparece em pedidos; mantenha-a inativa.");
      }
      throw err;
    }

    // Registro primeiro; falha no R2 deixa só arquivos órfãos e vira aviso.
    const filesFailed = await removeFiles(filesToRemove);
    res.json({ deleted: true, photosRemoved: product.images.length, filesFailed });
  })
);
