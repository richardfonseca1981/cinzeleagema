import { Router, type Request, type Response } from "express";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { createIpRateLimiter } from "../middleware/rateLimit";
import { asyncHandler } from "../utils/asyncHandler";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  fetchMercadoLivreUser,
  getActiveAccount,
  upsertAccountFromTokens,
  verifyOAuthState,
} from "../lib/mercadoLivre/auth";
import { isMercadoLivreConfigured } from "../lib/mercadoLivre/crypto";
import { logMercadoLivreAttempt } from "../lib/mercadoLivre/log";
import { validateListing } from "../lib/mercadoLivre/listingValidator";
import { generateTitleSuggestions, normalizeForMatch } from "../lib/mercadoLivre/titleGenerator";
import { buildListingDraft, getReadinessIssues, ListingNotReadyError } from "../lib/mercadoLivre/listingBuilder";
import {
  buildMercadoLivreItemPayload,
  buildMercadoLivreItemPayloadPreview,
  MercadoLivrePublishConfigError,
  type MercadoLivreItemPayload,
  type MercadoLivrePublishableProduct,
} from "../lib/mercadoLivre/publisherPayload";
import { buildMercadoLivreDescription } from "../lib/mercadoLivre/descriptionBuilder";
import { FakeMercadoLivrePublisherClient } from "../lib/mercadoLivre/publisherClient";
import { getMercadoLivrePublisherClient } from "../lib/mercadoLivre/publisherClientRegistry";
import { syncListingFromRemote } from "../lib/mercadoLivre/listingSync";
import { reprocessWebhookEvent } from "../lib/mercadoLivre/webhookProcessor";
import { MercadoLivreApiError } from "../lib/mercadoLivre/httpBase";
import {
  calculateSuggestedPrice,
  UNVERIFIED_DEFAULT_COMMISSION_PCT,
  UNVERIFIED_DEFAULT_FIXED_FEE_BRL,
  UNVERIFIED_DEFAULT_SHIPPING_COST_BRL,
} from "../lib/mercadoLivre/priceCalculator";
import {
  getListingActionTargetStatus,
  getTransitionBlockReason,
  type ListingLifecycleAction,
  type ListingTransitionBlockReason,
} from "../lib/mercadoLivre/listingLifecycle";
import { mercadoLivreSimulateQuerySchema } from "../schemas/mercadoLivreSimulate.schema";
import { mercadoLivrePublishBodySchema } from "../schemas/mercadoLivrePublish.schema";
import { mercadoLivreCloseBodySchema, mercadoLivrePauseAllBodySchema } from "../schemas/mercadoLivreListingAction.schema";

// Fase 0: só conexão/leitura, nenhuma publicação de anúncio. Todas as rotas
// exigem admin (requireAuth) — inclusive /callback: o ML_REDIRECT_URI deve
// apontar para uma página do admin (frontend) que lê code/state da URL e
// repassa para esta rota já com o Authorization: Bearer do admin logado (ver
// CONTEXT.md e o relatório da Fase 0). Um GET direto do navegador sem esse
// header nunca vai autenticar — é a decisão deliberada para manter
// requireAuth em todas as rotas, como pedido.
export const mercadoLivreRouter = Router();
mercadoLivreRouter.use(requireAuth);

// Etapa "título aprovado" — sugestões A/B geradas com o contexto do
// CATÁLOGO INTEIRO (mesma função usada pelo script generateTitleSuggestions.ts,
// pra manter a desduplicação entre peças de mesmo nome — ver titleGenerator.ts).
// Nunca chama a API do Mercado Livre; registrada ANTES do middleware de 503
// abaixo pelo mesmo motivo do /simulate acima.
mercadoLivreRouter.get(
  "/title-suggestions/:productId",
  asyncHandler(async (req, res) => {
    const products = await prisma.product.findMany({
      include: { images: { orderBy: { position: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });
    const target = products.find((p) => p.id === req.params.productId);
    if (!target) throw new HttpError(404, "Peça não encontrada");

    const row = generateTitleSuggestions(products).find((r) => r.id === target.id)!;

    // Colisão com o mlTitle JÁ APROVADO de OUTRAS peças — a desduplicação
    // de generateTitleSuggestions só compara sugestões entre si dentro desta
    // mesma chamada, nunca contra um título que outra peça já tem aprovado.
    const collisions: Array<{ field: "titleA" | "titleB"; productId: string; mlTitle: string }> = [];
    for (const other of products) {
      if (other.id === target.id) continue;
      const otherTitle = other.mlTitle?.trim();
      if (!otherTitle) continue;
      const normalizedOther = normalizeForMatch(otherTitle);
      if (row.titleA && normalizeForMatch(row.titleA) === normalizedOther) {
        collisions.push({ field: "titleA", productId: other.id, mlTitle: otherTitle });
      }
      if (row.titleB && normalizeForMatch(row.titleB) === normalizedOther) {
        collisions.push({ field: "titleB", productId: other.id, mlTitle: otherTitle });
      }
    }

    res.json({
      productId: target.id,
      currentName: row.currentName,
      titleA: row.titleA,
      titleALength: row.titleALength,
      titleB: row.titleB,
      titleBLength: row.titleBLength,
      warnings: row.warnings,
      collisions,
    });
  })
);

// Simulação e auditoria (Fase 1A): nunca chamam a API do Mercado Livre, só
// montam/validam/precificam localmente a partir do catálogo — por isso
// precisam funcionar mesmo sem nenhuma variável ML_* configurada. Registradas
// ANTES do middleware de 503 abaixo, que só se aplica às rotas de
// conexão/leitura real (connect/callback/status/disconnect).
mercadoLivreRouter.get(
  "/simulate/:productId",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.productId },
      include: { images: { orderBy: { position: "asc" } } },
    });
    if (!product) throw new HttpError(404, "Peça não encontrada");

    const validation = validateListing(product);
    if (!validation.eligible) {
      res.json({ productId: product.id, eligible: false, blockers: validation.blockers, warnings: validation.warnings });
      return;
    }

    const query = mercadoLivreSimulateQuerySchema.parse(req.query);
    const draft = buildListingDraft(product);

    // markupPct: query > conta conectada > 0. Só uma leitura no banco (sem
    // chamada à API do Mercado Livre) — funciona sem nenhuma variável ML_*
    // configurada, igual ao resto desta rota.
    const account = await getActiveAccount();
    const markupPct = query.markupPct ?? (account ? Number(account.markupPct) : 0);

    const commissionPct = query.commissionPct ?? UNVERIFIED_DEFAULT_COMMISSION_PCT;
    const fixedFeeBRL = query.fixedFeeBRL ?? UNVERIFIED_DEFAULT_FIXED_FEE_BRL;
    const shippingCostBRL = query.shippingCostBRL ?? UNVERIFIED_DEFAULT_SHIPPING_COST_BRL;
    const price = calculateSuggestedPrice(Number(product.price), {
      markupPct,
      commissionPct,
      fixedFeeBRL,
      shippingCostBRL,
    });

    res.json({
      productId: product.id,
      eligible: true,
      warnings: validation.warnings,
      // Mesmos códigos de getReadinessIssues (listingBuilder.ts) — inclui
      // "title_not_approved" enquanto draft.title vier do fallback (ver
      // resolveDraftTitle), nunca do mlTitle aprovado de verdade.
      issues: getReadinessIssues(draft),
      draft,
      price: {
        ...price,
        // Sinaliza quais valores vieram do padrão NÃO verificado (ver
        // priceCalculator.ts) em vez do que o admin informou na query.
        estimatesUsed: {
          commissionPct: query.commissionPct === undefined,
          fixedFeeBRL: query.fixedFeeBRL === undefined,
          shippingCostBRL: query.shippingCostBRL === undefined,
        },
      },
    });
  })
);

// Fase 1B etapa 5 — mesmo motivo do /simulate acima: nem a montagem do
// payload (dry-run) nem o fluxo real COM O CLIENTE FAKE injetado por teste
// (ver publisherClientRegistry.ts) dependem de nenhuma variável ML_* real —
// só de ML_PUBLISH_ENABLED e ML_LISTING_TYPE_ID. Registradas antes do
// middleware de 503 abaixo para os testes nunca precisarem simular
// credenciais OAuth que esta fase não tem.
// max generoso de propósito: este fluxo já é "uma peça por vez" por
// natureza (sem rota em lote, ver ponto 6 do pedido) — o limite aqui é só
// uma rede de segurança contra loop/abuso acidental, não um teto pensado
// para o ritmo normal de um admin clicando manualmente.
const publishRateLimiter = createIpRateLimiter({ windowMs: 60_000, max: 30 });

function roundBRL(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Converte os dois erros tipados que buildMercadoLivreItemPayload pode
// lançar (ver publisherPayload.ts) num HttpError apropriado — nunca deixa
// escapar como erro 500 genérico. Qualquer outro erro é relançado (bug
// inesperado, deixa o errorHandler padrão tratar).
function toPublishHttpError(err: unknown): HttpError {
  if (err instanceof ListingNotReadyError) return new HttpError(422, err.message);
  if (err instanceof MercadoLivrePublishConfigError) return new HttpError(503, err.message);
  if (err instanceof HttpError) return err;
  throw err;
}

const BLOCKING_LISTING_STATUSES = new Set(["active", "paused", "publishing"]);

mercadoLivreRouter.post(
  "/publish/:productId",
  publishRateLimiter,
  asyncHandler(async (req, res) => {
    const body = mercadoLivrePublishBodySchema.parse(req.body);

    const product = await prisma.product.findUnique({
      where: { id: req.params.productId },
      include: { images: { orderBy: { position: "asc" } } },
    });
    if (!product) throw new HttpError(404, "Peça não encontrada");

    if (body.mode === "real" && !body.confirm) {
      throw new HttpError(400, "Confirmação explícita obrigatória para publicar de verdade (confirm: true).");
    }

    const account = await getActiveAccount();
    const markupPct = account ? Number(account.markupPct) : 0;

    // Recalcula o preço de anúncio do zero (nunca confia no que o cliente
    // mandou além de expectedPrice, que serve só de checagem) — mesmas
    // tarifas de ponto de partida do /simulate (Fase 1A), markup sempre da
    // conta conectada (nunca de override na query/corpo, diferente de
    // /simulate).
    let priceBreakdown: ReturnType<typeof calculateSuggestedPrice>;
    let listingPriceBRL: number;
    try {
      priceBreakdown = calculateSuggestedPrice(Number(product.price), {
        markupPct,
        commissionPct: UNVERIFIED_DEFAULT_COMMISSION_PCT,
        fixedFeeBRL: UNVERIFIED_DEFAULT_FIXED_FEE_BRL,
        shippingCostBRL: UNVERIFIED_DEFAULT_SHIPPING_COST_BRL,
      });
      listingPriceBRL = roundBRL(priceBreakdown.listingPrice);
    } catch (err) {
      logMercadoLivreAttempt({ productId: product.id, mode: body.mode, result: "price_calc_failed" });
      throw new HttpError(422, err instanceof Error ? err.message : "Não foi possível calcular o preço de anúncio.");
    }

    if (roundBRL(body.expectedPrice) !== listingPriceBRL) {
      logMercadoLivreAttempt({ productId: product.id, mode: body.mode, result: "price_mismatch" });
      throw new HttpError(
        409,
        `Preço de anúncio mudou desde que a tela foi carregada (atual R$ ${listingPriceBRL.toFixed(2)}, informado R$ ${body.expectedPrice.toFixed(2)}) — recarregue a simulação e confirme de novo.`
      );
    }

    // ML_PUBLISH_ENABLED=false força dry-run mesmo pedindo "real" — kill
    // switch global (ver lib/env.ts), sempre vence sobre o modo pedido.
    const forcedDryRun = body.mode === "real" && !env.ML_PUBLISH_ENABLED;
    const effectiveMode: "dry-run" | "real" = body.mode === "dry-run" || forcedDryRun ? "dry-run" : "real";

    if (effectiveMode === "dry-run") {
      // Ajuste pós-etapa-5 (ponto A): dry-run NUNCA bloqueia por categoria/
      // embalagem ainda não prontas (ver buildMercadoLivreItemPayloadPreview)
      // — sempre devolve o payload completo + a lista de pendências
      // (`issues`), marcado explicitamente como prévia não publicável
      // enquanto `issues` não estiver vazia. Só config ausente/preço
      // inválido/peça inelegível continuam bloqueando os dois modos.
      let payload: MercadoLivreItemPayload;
      let issues: ReturnType<typeof buildMercadoLivreItemPayloadPreview>["issues"];
      let packageBoxSource: ReturnType<typeof buildMercadoLivreItemPayloadPreview>["packageBoxSource"];
      try {
        ({ payload, issues, packageBoxSource } = buildMercadoLivreItemPayloadPreview({
          product: product as MercadoLivrePublishableProduct,
          listingPriceBRL,
        }));
      } catch (err) {
        logMercadoLivreAttempt({ productId: product.id, mode: "dry-run", result: "validation_failed" });
        throw toPublishHttpError(err);
      }

      // Cliente FAKE local, descartável — nunca o singleton do fluxo real
      // (ver publisherClientRegistry.ts) e nunca grava nada no nosso banco:
      // só monta uma prévia de id/permalink para a tela de revisão.
      const previewClient = new FakeMercadoLivrePublisherClient();
      const preview = await previewClient.createItem(account?.id ?? "dry-run", payload);
      await previewClient.setItemDescription(account?.id ?? "dry-run", preview.id, buildMercadoLivreDescription({
        ...product,
        weightGrams: Number(product.weightGrams),
        sizeCm: Number(product.sizeCm),
      }));

      logMercadoLivreAttempt({ productId: product.id, mode: "dry-run", result: "previewed" });
      res.json({
        productId: product.id,
        mode: "dry-run",
        forcedDryRun,
        price: priceBreakdown,
        payload,
        issues,
        packageBoxSource,
        publishable: issues.length === 0,
        notice: issues.length > 0 ? "Prévia — não publicável enquanto houver pendências (ver issues)." : null,
        preview: { mlItemId: preview.id, permalink: preview.permalink },
      });
      return;
    }

    // Modo real a partir daqui: ML_PUBLISH_ENABLED=true e confirm=true já
    // garantidos acima.
    if (!account) throw new HttpError(503, "Nenhuma conta do Mercado Livre conectada — conecte antes de publicar.");

    let payload: MercadoLivreItemPayload;
    try {
      payload = buildMercadoLivreItemPayload({ product: product as MercadoLivrePublishableProduct, listingPriceBRL });
    } catch (err) {
      logMercadoLivreAttempt({ productId: product.id, mode: "real", result: "validation_failed" });
      throw toPublishHttpError(err);
    }

    // Ajuste pós-etapa-5 (ponto C): checagem de idempotência + gravação de
    // "publishing" são atômicas sob um advisory lock do Postgres por
    // accountId+productId (mesma técnica de auth.ts performRefresh) — duas
    // publicações concorrentes da MESMA peça serializam aqui. A 2ª a obter o
    // lock sempre vê o resultado já commitado da 1ª (findUnique dentro da
    // transação, nunca a leitura de fora feita antes do lock) e bloqueia com
    // 409 ANTES de chamar createItem — nunca duas chamadas a POST /items pra
    // mesma peça. Diferente de performRefresh, o lock NÃO cobre a chamada de
    // rede (createItem, abaixo, fora da transação): ela pode ser lenta/
    // sujeita a timeout, e o status "publishing" já commitado é suficiente
    // pra barrar outra tentativa concorrente sem precisar segurar o lock (e
    // o timeout padrão de transação interativa do Prisma) durante o POST.
    const listing = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${account.id}:${product.id}`}))`;

      const existing = await tx.mercadoLivreListing.findUnique({
        where: { accountId_productId: { accountId: account.id, productId: product.id } },
      });

      if (existing && BLOCKING_LISTING_STATUSES.has(existing.status)) {
        throw new HttpError(
          409,
          `Já existe um anúncio para esta peça (status atual: "${existing.status}") — rode a reconciliação ou encerre o anúncio antes de publicar de novo.`
        );
      }

      // Grava "publishing" ANTES do POST /items — se a resposta nunca
      // chegar (timeout/5xx), a linha fica nesse estado em vez de nunca ter
      // sido registrada, para a reconciliação (findItemsBySku) ter o que
      // adotar.
      return existing
        ? tx.mercadoLivreListing.update({
            where: { id: existing.id },
            data: { status: "publishing", categoryId: payload.category_id, lastError: null },
          })
        : tx.mercadoLivreListing.create({
            data: { accountId: account.id, productId: product.id, status: "publishing", categoryId: payload.category_id },
          });
    }).catch((err) => {
      if (err instanceof HttpError) {
        logMercadoLivreAttempt({ productId: product.id, mode: "real", result: "blocked_duplicate" });
      }
      throw err;
    });

    const client = getMercadoLivrePublisherClient();

    let created: { id: string; permalink: string };
    try {
      created = await client.createItem(account.id, payload);
    } catch (err) {
      const apiErr = err instanceof MercadoLivreApiError ? err : null;
      // 4xx de validação (exceto 429, que é rate limit — ambíguo quanto a
      // ter sido processado, tratado como timeout/5xx abaixo): o Mercado
      // Livre recusou o anúncio por um motivo que não se resolve tentando de
      // novo sem mudar nada — erro definitivo, nunca retry.
      const isValidationError = apiErr && apiErr.status >= 400 && apiErr.status < 500 && apiErr.status !== 429;
      const message = apiErr ? apiErr.message : err instanceof Error ? err.message : String(err);

      if (isValidationError) {
        await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { status: "error", lastError: message } });
        logMercadoLivreAttempt({ productId: product.id, mode: "real", result: "create_rejected" });
        throw new HttpError(422, `Mercado Livre recusou o anúncio: ${message}`);
      }

      // Timeout/429/5xx: nunca sabemos se o Mercado Livre já criou o item do
      // outro lado — a linha fica em "publishing" (NUNCA tentamos de novo
      // aqui, ver client.ts maxRetries:0) até a reconciliação por SKU
      // confirmar o que de fato aconteceu.
      await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { lastError: message } });
      logMercadoLivreAttempt({ productId: product.id, mode: "real", result: "create_ambiguous_failure" });
      throw new HttpError(
        502,
        `Falha ao confirmar a publicação no Mercado Livre (${message}) — rode a reconciliação (POST /reconcile/${product.id}) antes de tentar de novo, para não arriscar duplicar o anúncio.`
      );
    }

    await prisma.mercadoLivreListing.update({
      where: { id: listing.id },
      data: { mlItemId: created.id, permalink: created.permalink, status: "active", lastError: null },
    });

    try {
      const description = buildMercadoLivreDescription({
        ...product,
        weightGrams: Number(product.weightGrams),
        sizeCm: Number(product.sizeCm),
      });
      await client.setItemDescription(account.id, created.id, description);
      await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { lastSyncAt: new Date(), lastError: null } });
      logMercadoLivreAttempt({ productId: product.id, mode: "real", result: "published" });
      res.json({ productId: product.id, mode: "real", status: "active", mlItemId: created.id, permalink: created.permalink });
    } catch (err) {
      // Item já existe no Mercado Livre — só a descrição falhou. Nunca
      // reverte o item criado nem tenta de novo automaticamente (ver rota de
      // reenvio de descrição abaixo); a peça fica publicada, só com a
      // descrição estendida pendente.
      await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { lastError: "description_failed" } });
      logMercadoLivreAttempt({ productId: product.id, mode: "real", result: "description_failed" });
      res.status(207).json({
        productId: product.id,
        mode: "real",
        status: "active",
        mlItemId: created.id,
        permalink: created.permalink,
        warning: "description_failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  })
);

// Reenvio da descrição quando ela falhou na publicação (lastError
// "description_failed", ver acima) — nunca refaz createItem, só
// setItemDescription de novo no item já existente.
mercadoLivreRouter.post(
  "/publish/:productId/retry-description",
  publishRateLimiter,
  asyncHandler(async (req, res) => {
    const account = await getActiveAccount();
    if (!account) throw new HttpError(503, "Nenhuma conta do Mercado Livre conectada.");

    const product = await prisma.product.findUnique({ where: { id: req.params.productId } });
    if (!product) throw new HttpError(404, "Peça não encontrada");

    const listing = await prisma.mercadoLivreListing.findUnique({
      where: { accountId_productId: { accountId: account.id, productId: product.id } },
    });
    if (!listing?.mlItemId) throw new HttpError(404, "Nenhum anúncio publicado encontrado para esta peça.");

    const client = getMercadoLivrePublisherClient();
    const description = buildMercadoLivreDescription({
      ...product,
      weightGrams: Number(product.weightGrams),
      sizeCm: Number(product.sizeCm),
    });

    try {
      await client.setItemDescription(account.id, listing.mlItemId, description);
      await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { lastError: null, lastSyncAt: new Date() } });
      logMercadoLivreAttempt({ productId: product.id, mode: "real", result: "description_retry_ok" });
      res.json({ productId: product.id, status: "active", mlItemId: listing.mlItemId });
    } catch (err) {
      logMercadoLivreAttempt({ productId: product.id, mode: "real", result: "description_retry_failed" });
      throw new HttpError(502, `Falha ao reenviar a descrição: ${err instanceof Error ? err.message : String(err)}`);
    }
  })
);

// Fase 1B etapa 5 — rotina de reconciliação: para linhas em "publishing" (o
// POST /items nunca confirmou sucesso) ou "error" (motivo ambíguo), usa
// findItemsBySku para descobrir se o Mercado Livre criou o item mesmo assim
// e adotá-lo, sem nunca criar um segundo item para a mesma peça.
mercadoLivreRouter.post(
  "/reconcile/:productId",
  publishRateLimiter,
  asyncHandler(async (req, res) => {
    const account = await getActiveAccount();
    if (!account) throw new HttpError(503, "Nenhuma conta do Mercado Livre conectada.");

    const product = await prisma.product.findUnique({ where: { id: req.params.productId } });
    if (!product) throw new HttpError(404, "Peça não encontrada");
    if (!product.sku) throw new HttpError(422, "Peça sem SKU cadastrado — reconciliação por SKU não é possível.");

    const listing = await prisma.mercadoLivreListing.findUnique({
      where: { accountId_productId: { accountId: account.id, productId: product.id } },
    });
    if (!listing) throw new HttpError(404, "Nenhum registro de publicação encontrado para esta peça.");

    if (listing.status !== "publishing" && listing.status !== "error") {
      res.json({ productId: product.id, status: listing.status, reconciled: false, reason: "already_resolved" });
      return;
    }

    const client = getMercadoLivrePublisherClient();
    const found = await client.findItemsBySku(account.id, product.sku);

    if (found.length === 0) {
      // Libera nova tentativa: "error" nunca bloqueia a checagem de
      // idempotência do POST /publish (ver BLOCKING_LISTING_STATUSES acima).
      await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { status: "error", lastError: "reconcile_not_found" } });
      logMercadoLivreAttempt({ productId: product.id, mode: "reconcile", result: "not_found" });
      res.json({ productId: product.id, status: "error", reconciled: false, reason: "not_found" });
      return;
    }

    // Ajuste pós-etapa-5 (ponto B): mais de um resultado é ambíguo (nunca
    // esperado por este fluxo, que só publica uma peça por vez) — NUNCA
    // adota nenhum automaticamente. Devolve a lista completa pra decisão
    // manual, sem tocar na linha local (fica como estava, pra rodar de novo
    // depois que o caso for resolvido).
    if (found.length > 1) {
      logMercadoLivreAttempt({ productId: product.id, mode: "reconcile", result: "ambiguous" });
      res.status(409).json({ productId: product.id, status: listing.status, reconciled: false, reason: "ambiguous", candidates: found });
      return;
    }

    const match = found[0];
    await prisma.mercadoLivreListing.update({
      where: { id: listing.id },
      data: { mlItemId: match.id, permalink: match.permalink, status: match.status, lastError: null, lastSyncAt: new Date() },
    });
    logMercadoLivreAttempt({ productId: product.id, mode: "reconcile", result: "adopted" });
    res.json({ productId: product.id, status: match.status, reconciled: true, mlItemId: match.id, permalink: match.permalink });
  })
);

// Fase 1B etapa 6 — pausar/reativar/encerrar um anúncio JÁ publicado, e
// sincronizar o status local com o que está no Mercado Livre agora. Mesmo
// motivo das rotas de publicação/reconciliação acima: registradas ANTES do
// middleware de 503 abaixo, funcionam com o cliente FAKE injetado por teste
// sem precisar de nenhuma credencial ML_* real.
const TRANSITION_BLOCK_MESSAGES: Record<ListingTransitionBlockReason, (status: string) => string> = {
  already_closed: () =>
    'Anúncio já está encerrado ("closed") — ação irreversível, não é possível reabrir nem alterar de novo.',
  needs_reconciliation: (status) =>
    `Anúncio em status "${status}" — rode a reconciliação (POST /reconcile/:productId) antes de pausar/reativar/encerrar.`,
  invalid_transition: (status) => `Transição inválida a partir do status atual ("${status}").`,
};

const LIFECYCLE_ACTION_LABEL: Record<ListingLifecycleAction, string> = {
  pause: "pausar",
  reactivate: "reativar",
  close: "encerrar",
};

// Compartilhada pelas 3 rotas de ação individual (pause/reactivate/close) —
// a única diferença entre elas é qual `action` é passada; toda a regra de
// transição válida/bloqueio mora em listingLifecycle.ts, nunca duplicada
// aqui.
async function performListingTransition(req: Request, res: Response, action: ListingLifecycleAction): Promise<void> {
  const account = await getActiveAccount();
  if (!account) throw new HttpError(503, "Nenhuma conta do Mercado Livre conectada.");

  const product = await prisma.product.findUnique({ where: { id: req.params.productId } });
  if (!product) throw new HttpError(404, "Peça não encontrada");

  const listing = await prisma.mercadoLivreListing.findUnique({
    where: { accountId_productId: { accountId: account.id, productId: product.id } },
  });
  if (!listing) throw new HttpError(404, "Nenhum anúncio encontrado para esta peça.");

  const blockReason = getTransitionBlockReason(listing.status, action);
  if (blockReason) {
    logMercadoLivreAttempt({ productId: product.id, mode: action, result: `blocked_${blockReason}` });
    throw new HttpError(409, TRANSITION_BLOCK_MESSAGES[blockReason](listing.status));
  }

  // Única ação que a flag global bloqueia — pausar/encerrar são ações de
  // SEGURANÇA (nunca publicam nada novo no Mercado Livre), continuam
  // liberadas com ML_PUBLISH_ENABLED=false (ver decisão do cliente,
  // CONTEXT.md). Reativar volta a expor o anúncio como se fosse uma
  // publicação nova — por isso respeita o kill switch, igual ao POST
  // /publish. Nunca lança erro: devolve 200 com forcedDryRun, mesmo padrão
  // de resposta do /publish quando a flag força dry-run.
  if (action === "reactivate" && !env.ML_PUBLISH_ENABLED) {
    logMercadoLivreAttempt({ productId: product.id, mode: action, result: "forced_dry_run" });
    res.json({
      productId: product.id,
      action,
      status: listing.status,
      forcedDryRun: true,
      notice: "ML_PUBLISH_ENABLED=false — reativação não enviada ao Mercado Livre.",
    });
    return;
  }

  if (!listing.mlItemId) {
    throw new HttpError(422, "Anúncio sem mlItemId registrado — rode a reconciliação antes de pausar/reativar/encerrar.");
  }

  const targetStatus = getListingActionTargetStatus(action);
  const client = getMercadoLivrePublisherClient();

  try {
    // maxRetries: 0 no PUT (ver publisherClient.ts) — mesmo motivo do
    // createItem: um 429/5xx aqui pode significar que o Mercado Livre já
    // aplicou a mudança e só a resposta se perdeu.
    await client.updateItemStatus(account.id, listing.mlItemId, targetStatus);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Estado local só muda DEPOIS do sucesso da API — em falha, grava
    // lastError e MANTÉM o status anterior (nunca assume que o PUT aplicou
    // do lado do Mercado Livre).
    await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { lastError: message } });
    logMercadoLivreAttempt({ productId: product.id, mode: action, result: "api_error" });
    throw new HttpError(502, `Falha ao ${LIFECYCLE_ACTION_LABEL[action]} o anúncio no Mercado Livre: ${message}`);
  }

  const updated = await prisma.mercadoLivreListing.update({
    where: { id: listing.id },
    data: { status: targetStatus, lastError: null, lastSyncAt: new Date() },
  });
  logMercadoLivreAttempt({ productId: product.id, mode: action, result: "ok" });
  res.json({ productId: product.id, action, status: updated.status, mlItemId: updated.mlItemId });
}

mercadoLivreRouter.post(
  "/listings/:productId/pause",
  publishRateLimiter,
  asyncHandler((req, res) => performListingTransition(req, res, "pause"))
);

mercadoLivreRouter.post(
  "/listings/:productId/reactivate",
  publishRateLimiter,
  asyncHandler((req, res) => performListingTransition(req, res, "reactivate"))
);

mercadoLivreRouter.post(
  "/listings/:productId/close",
  publishRateLimiter,
  asyncHandler(async (req, res) => {
    // Irreversível (closed é terminal) — confirmação reforçada com a string
    // exata, verificada ANTES de qualquer leitura/transição (ver
    // mercadoLivreListingAction.schema.ts).
    mercadoLivreCloseBodySchema.parse(req.body);
    await performListingTransition(req, res, "close");
  })
);

// "Pausar tudo": afeta TODOS os anúncios ativos da conta de uma vez — nunca
// automático, sempre exige a confirmação reforçada. Processa um anúncio por
// vez (nunca em paralelo — mais fácil de diagnosticar se o Mercado Livre
// estiver instável, e nunca sobrecarrega a API com N chamadas simultâneas),
// continua em caso de erro individual e devolve um resumo ok/erro por
// anúncio — uma falha isolada nunca aborta o restante do lote.
mercadoLivreRouter.post(
  "/listings/pause-all",
  publishRateLimiter,
  asyncHandler(async (req, res) => {
    mercadoLivrePauseAllBodySchema.parse(req.body);

    const account = await getActiveAccount();
    if (!account) throw new HttpError(503, "Nenhuma conta do Mercado Livre conectada.");

    const activeListings = await prisma.mercadoLivreListing.findMany({
      where: { accountId: account.id, status: "active" },
    });

    const client = getMercadoLivrePublisherClient();
    const results: Array<{ productId: string; mlItemId: string | null; ok: boolean; error?: string }> = [];

    for (const listing of activeListings) {
      if (!listing.mlItemId) {
        results.push({ productId: listing.productId, mlItemId: null, ok: false, error: "sem mlItemId registrado" });
        continue;
      }
      try {
        await client.updateItemStatus(account.id, listing.mlItemId, "paused");
        await prisma.mercadoLivreListing.update({
          where: { id: listing.id },
          data: { status: "paused", lastError: null, lastSyncAt: new Date() },
        });
        results.push({ productId: listing.productId, mlItemId: listing.mlItemId, ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Mesma regra das ações individuais: falha mantém o status anterior
        // ("active"), só grava lastError — nunca assume que o PUT aplicou.
        await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { lastError: message } });
        results.push({ productId: listing.productId, mlItemId: listing.mlItemId, ok: false, error: message });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    logMercadoLivreAttempt({ productId: "*", mode: "pause-all", result: `${succeeded}/${results.length} ok` });
    res.json({ total: results.length, succeeded, results });
  })
);

// Sincronização: lê o status atual do item diretamente no Mercado Livre e
// atualiza a linha local — útil quando alguém pausa/reativa/encerra direto
// no painel do Mercado Livre, fora destas rotas admin. GET e POST aceitos
// de propósito (leitura remota + escrita local: nem puramente idempotente
// como um GET comum, nem uma ação de negócio como as rotas acima).
async function performListingSync(req: Request, res: Response): Promise<void> {
  const account = await getActiveAccount();
  if (!account) throw new HttpError(503, "Nenhuma conta do Mercado Livre conectada.");

  const product = await prisma.product.findUnique({ where: { id: req.params.productId } });
  if (!product) throw new HttpError(404, "Peça não encontrada");

  const listing = await prisma.mercadoLivreListing.findUnique({
    where: { accountId_productId: { accountId: account.id, productId: product.id } },
  });
  if (!listing) throw new HttpError(404, "Nenhum anúncio encontrado para esta peça.");
  if (!listing.mlItemId) throw new HttpError(422, "Anúncio sem mlItemId registrado — nada para sincronizar.");

  const result = await syncListingFromRemote(account, listing);
  if (!result.ok) {
    logMercadoLivreAttempt({ productId: product.id, mode: "sync", result: "api_error" });
    throw new HttpError(502, `Falha ao sincronizar com o Mercado Livre: ${result.error}`);
  }

  logMercadoLivreAttempt({ productId: product.id, mode: "sync", result: "ok" });
  res.json({ productId: product.id, status: result.status, mlItemId: listing.mlItemId, permalink: result.permalink, synced: true });
}

mercadoLivreRouter.get("/listings/:productId/sync", publishRateLimiter, asyncHandler(performListingSync));
mercadoLivreRouter.post("/listings/:productId/sync", publishRateLimiter, asyncHandler(performListingSync));

// Fase 1B etapa 8 — visibilidade/reprocessamento dos eventos de webhook
// (ver webhookProcessor.ts e mercadoLivreWebhook.routes.ts, rota pública
// separada). Registradas aqui, ANTES do middleware de 503 abaixo, pelo MESMO
// motivo das rotas acima: funcionam com o cliente FAKE injetado por teste
// sem nenhuma credencial ML_* real — `reprocessWebhookEvent` só depende de
// `getActiveAccount()` (leitura no banco) e do publisher client.
//
// O Mercado Livre só reenvia uma notificação quando NÃO recebe 200 rápido o
// suficiente (ver mercadoLivreWebhook.routes.ts: respondemos 200 ANTES de
// processar) — um erro de processamento DEPOIS da resposta nunca seria
// repetido sozinho por eles. Esta rota de listagem + a de reprocessar
// existem exatamente pra cobrir essa lacuna manualmente.
mercadoLivreRouter.get(
  "/webhook-events",
  publishRateLimiter,
  asyncHandler(async (req, res) => {
    // ?status=all devolve todos os eventos; por padrão só os com erro de
    // verdade (lastError não nulo — ver schema.prisma, nota sobre
    // lastError vs. note: eventos "ignorados"/informativos NUNCA aparecem
    // aqui, só falhas técnicas elegíveis pra reprocessar).
    const onlyErrors = req.query.status !== "all";
    const events = await prisma.mercadoLivreWebhookEvent.findMany({
      where: onlyErrors ? { lastError: { not: null } } : {},
      orderBy: { receivedAt: "desc" },
      take: 200,
    });
    res.json({ items: events });
  })
);

mercadoLivreRouter.post(
  "/webhook-events/:id/reprocess",
  publishRateLimiter,
  asyncHandler(async (req, res) => {
    const event = await prisma.mercadoLivreWebhookEvent.findUnique({ where: { id: req.params.id } });
    if (!event) throw new HttpError(404, "Evento não encontrado.");

    const result = await reprocessWebhookEvent(event.id);
    const updated = await prisma.mercadoLivreWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    logMercadoLivreAttempt({ productId: event.resource ?? "unknown", mode: "webhook-reprocess", result: result.ok ? "ok" : "error" });
    res.status(result.ok ? 200 : 502).json({ ok: result.ok, message: result.message, event: updated });
  })
);

// Fase 1B etapa 9 — ajuste: /status passou a morar AQUI (antes do
// middleware de 503 abaixo, mesmo motivo das demais rotas desta seção), pois
// agora também expõe `publishEnabled`/`listingTypeConfigured` — informação
// que o admin precisa ver (banner "publicação real desligada") mesmo sem
// nenhuma variável ML_* configurada (o cenário de hoje). `serializeAccount`
// continua a mesma função (hoisted), reaproveitada por /callback mais abaixo
// sem mudança.
mercadoLivreRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const account = await getActiveAccount();
    res.json({
      publishEnabled: env.ML_PUBLISH_ENABLED,
      listingTypeConfigured: Boolean(env.ML_LISTING_TYPE_ID),
      ...(account ? serializeAccount(account) : { connected: false }),
    });
  })
);

// Leitura pura do registro LOCAL de um anúncio (nunca chama a API do
// Mercado Livre, ao contrário de /sync) — usada pela tela admin pra mostrar
// o "cartão do anúncio publicado" sem precisar de uma chamada de rede a cada
// carregamento de página. `listing: null` tanto na ausência de conta quanto
// na ausência de registro pra esta peça — a tela trata os dois casos igual
// ("nenhum anúncio ainda").
mercadoLivreRouter.get(
  "/listings/:productId",
  publishRateLimiter,
  asyncHandler(async (req, res) => {
    const account = await getActiveAccount();
    if (!account) {
      res.json({ listing: null });
      return;
    }
    const listing = await prisma.mercadoLivreListing.findUnique({
      where: { accountId_productId: { accountId: account.id, productId: req.params.productId } },
    });
    res.json({ listing: listing ?? null });
  })
);

// Fase 1B etapa 9 — painel "Pendências" do admin: agrega, numa única
// chamada, tudo que precisa de atenção manual. "Pausa pendente" é
// identificada pelo prefixo "pause_pending: " em `lastError` (ver
// stockSync.ts/productStock.routes.ts, Etapa 7) — decisão deliberada de NÃO
// criar uma coluna nova só pra isso: o prefixo é inteiramente gerado por
// nós (zero risco de colisão com uma mensagem de erro de verdade), o filtro
// Prisma `startsWith` já é uma query limpa (sem SQL cru), e uma coluna
// dedicada só valeria a pena se também fôssemos rastrear tentativas/motivo
// estruturado — fora do escopo desta etapa (ver CONTEXT.md).
mercadoLivreRouter.get(
  "/pendencias",
  publishRateLimiter,
  asyncHandler(async (_req, res) => {
    const account = await getActiveAccount();
    const [pausePending, stuckPublishing, webhookErrors, webhookNotes] = await Promise.all([
      account
        ? prisma.mercadoLivreListing.findMany({
            where: { accountId: account.id, lastError: { startsWith: "pause_pending:" } },
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve([]),
      account
        ? prisma.mercadoLivreListing.findMany({ where: { accountId: account.id, status: "publishing" }, orderBy: { updatedAt: "desc" } })
        : Promise.resolve([]),
      prisma.mercadoLivreWebhookEvent.findMany({ where: { lastError: { not: null } }, orderBy: { receivedAt: "desc" }, take: 100 }),
      prisma.mercadoLivreWebhookEvent.findMany({ where: { note: { not: null } }, orderBy: { receivedAt: "desc" }, take: 100 }),
    ]);
    res.json({ pausePending, stuckPublishing, webhookErrors, webhookNotes });
  })
);

// Produção hoje não tem nenhuma variável ML_* — o boot do backend não pode
// depender delas (ver lib/env.ts). A validação só acontece aqui, quando uma
// rota do Mercado Livre é de fato chamada: sem isso, toda rota responde 503
// de forma uniforme em vez de cada handler reimplementar a checagem (ou,
// pior, vazar um 200/204 "vazio" por nunca existir conta no banco).
mercadoLivreRouter.use((_req, _res, next) => {
  if (!isMercadoLivreConfigured()) {
    throw new HttpError(503, "Integração Mercado Livre não configurada");
  }
  next();
});

function serializeAccount(account: { mlUserId: string; nickname: string; expiresAt: Date; scope: string; markupPct: unknown }) {
  return {
    connected: true,
    mlUserId: account.mlUserId,
    nickname: account.nickname,
    expiresAt: account.expiresAt,
    scope: account.scope,
    markupPct: Number(account.markupPct),
  };
}

mercadoLivreRouter.get(
  "/connect",
  asyncHandler(async (req, res) => {
    const adminId = req.admin!.sub;
    const { url, state } = buildAuthorizationUrl(adminId);
    res.json({ url, state });
  })
);

mercadoLivreRouter.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code || !state) throw new HttpError(400, "code e state são obrigatórios");

    const { adminId } = verifyOAuthState(state);
    if (adminId !== req.admin!.sub) {
      throw new HttpError(403, "Esta autorização foi iniciada por outro admin — reinicie a conexão");
    }

    const tokenResponse = await exchangeCodeForTokens(code);
    const user = await fetchMercadoLivreUser(tokenResponse.access_token);
    const account = await upsertAccountFromTokens(tokenResponse, user.nickname);

    res.json(serializeAccount(account));
  })
);

mercadoLivreRouter.delete(
  "/disconnect",
  asyncHandler(async (_req, res) => {
    const account = await getActiveAccount();
    if (account) {
      await prisma.mercadoLivreAccount.delete({ where: { id: account.id } });
    }
    res.status(204).end();
  })
);
