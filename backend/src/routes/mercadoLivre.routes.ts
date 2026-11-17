import { Router } from "express";
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
import { validateListing } from "../lib/mercadoLivre/listingValidator";
import { buildListingDraft, ListingNotReadyError } from "../lib/mercadoLivre/listingBuilder";
import {
  buildMercadoLivreItemPayload,
  MercadoLivrePublishConfigError,
  type MercadoLivreItemPayload,
  type MercadoLivrePublishableProduct,
} from "../lib/mercadoLivre/publisherPayload";
import { buildMercadoLivreDescription } from "../lib/mercadoLivre/descriptionBuilder";
import { FakeMercadoLivrePublisherClient } from "../lib/mercadoLivre/publisherClient";
import { getMercadoLivrePublisherClient } from "../lib/mercadoLivre/publisherClientRegistry";
import { MercadoLivreApiError } from "../lib/mercadoLivre/httpBase";
import {
  calculateSuggestedPrice,
  UNVERIFIED_DEFAULT_COMMISSION_PCT,
  UNVERIFIED_DEFAULT_FIXED_FEE_BRL,
  UNVERIFIED_DEFAULT_SHIPPING_COST_BRL,
} from "../lib/mercadoLivre/priceCalculator";
import { mercadoLivreSimulateQuerySchema } from "../schemas/mercadoLivreSimulate.schema";
import { mercadoLivrePublishBodySchema } from "../schemas/mercadoLivrePublish.schema";

// Fase 0: só conexão/leitura, nenhuma publicação de anúncio. Todas as rotas
// exigem admin (requireAuth) — inclusive /callback: o ML_REDIRECT_URI deve
// apontar para uma página do admin (frontend) que lê code/state da URL e
// repassa para esta rota já com o Authorization: Bearer do admin logado (ver
// CONTEXT.md e o relatório da Fase 0). Um GET direto do navegador sem esse
// header nunca vai autenticar — é a decisão deliberada para manter
// requireAuth em todas as rotas, como pedido.
export const mercadoLivreRouter = Router();
mercadoLivreRouter.use(requireAuth);

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

// Log estruturado de cada tentativa de publicação/reconciliação — peça,
// modo e resultado, nunca payload completo nem qualquer token/credencial
// (ver ponto 6 do pedido: "sem dados sensíveis nem tokens em log").
function logPublishAttempt(entry: { productId: string; mode: string; result: string }): void {
  console.info(JSON.stringify({ event: "ml_publish_attempt", ...entry, at: new Date().toISOString() }));
}

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
      logPublishAttempt({ productId: product.id, mode: body.mode, result: "price_calc_failed" });
      throw new HttpError(422, err instanceof Error ? err.message : "Não foi possível calcular o preço de anúncio.");
    }

    if (roundBRL(body.expectedPrice) !== listingPriceBRL) {
      logPublishAttempt({ productId: product.id, mode: body.mode, result: "price_mismatch" });
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
      let payload: MercadoLivreItemPayload;
      try {
        payload = buildMercadoLivreItemPayload({ product: product as MercadoLivrePublishableProduct, listingPriceBRL });
      } catch (err) {
        logPublishAttempt({ productId: product.id, mode: "dry-run", result: "validation_failed" });
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

      logPublishAttempt({ productId: product.id, mode: "dry-run", result: "previewed" });
      res.json({
        productId: product.id,
        mode: "dry-run",
        forcedDryRun,
        price: priceBreakdown,
        payload,
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
      logPublishAttempt({ productId: product.id, mode: "real", result: "validation_failed" });
      throw toPublishHttpError(err);
    }

    const existing = await prisma.mercadoLivreListing.findUnique({
      where: { accountId_productId: { accountId: account.id, productId: product.id } },
    });

    if (existing && BLOCKING_LISTING_STATUSES.has(existing.status)) {
      logPublishAttempt({ productId: product.id, mode: "real", result: "blocked_duplicate" });
      throw new HttpError(
        409,
        `Já existe um anúncio para esta peça (status atual: "${existing.status}") — rode a reconciliação ou encerre o anúncio antes de publicar de novo.`
      );
    }

    // Grava "publishing" ANTES do POST /items — se a resposta nunca chegar
    // (timeout/5xx), a linha fica nesse estado em vez de nunca ter sido
    // registrada, para a reconciliação (findItemsBySku) ter o que adotar.
    const listing = existing
      ? await prisma.mercadoLivreListing.update({
          where: { id: existing.id },
          data: { status: "publishing", categoryId: payload.category_id, lastError: null },
        })
      : await prisma.mercadoLivreListing.create({
          data: { accountId: account.id, productId: product.id, status: "publishing", categoryId: payload.category_id },
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
        logPublishAttempt({ productId: product.id, mode: "real", result: "create_rejected" });
        throw new HttpError(422, `Mercado Livre recusou o anúncio: ${message}`);
      }

      // Timeout/429/5xx: nunca sabemos se o Mercado Livre já criou o item do
      // outro lado — a linha fica em "publishing" (NUNCA tentamos de novo
      // aqui, ver client.ts maxRetries:0) até a reconciliação por SKU
      // confirmar o que de fato aconteceu.
      await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { lastError: message } });
      logPublishAttempt({ productId: product.id, mode: "real", result: "create_ambiguous_failure" });
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
      logPublishAttempt({ productId: product.id, mode: "real", result: "published" });
      res.json({ productId: product.id, mode: "real", status: "active", mlItemId: created.id, permalink: created.permalink });
    } catch (err) {
      // Item já existe no Mercado Livre — só a descrição falhou. Nunca
      // reverte o item criado nem tenta de novo automaticamente (ver rota de
      // reenvio de descrição abaixo); a peça fica publicada, só com a
      // descrição estendida pendente.
      await prisma.mercadoLivreListing.update({ where: { id: listing.id }, data: { lastError: "description_failed" } });
      logPublishAttempt({ productId: product.id, mode: "real", result: "description_failed" });
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
      logPublishAttempt({ productId: product.id, mode: "real", result: "description_retry_ok" });
      res.json({ productId: product.id, status: "active", mlItemId: listing.mlItemId });
    } catch (err) {
      logPublishAttempt({ productId: product.id, mode: "real", result: "description_retry_failed" });
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
      logPublishAttempt({ productId: product.id, mode: "reconcile", result: "not_found" });
      res.json({ productId: product.id, status: "error", reconciled: false, reason: "not_found" });
      return;
    }

    // Mais de um resultado seria ambíguo (nunca esperado por este fluxo, que
    // só publica uma peça por vez) — adota o primeiro e segue, sem bloquear:
    // investigação manual fica para fora do escopo desta fase.
    const match = found[0];
    await prisma.mercadoLivreListing.update({
      where: { id: listing.id },
      data: { mlItemId: match.id, permalink: match.permalink, status: match.status, lastError: null, lastSyncAt: new Date() },
    });
    logPublishAttempt({ productId: product.id, mode: "reconcile", result: "adopted" });
    res.json({ productId: product.id, status: match.status, reconciled: true, mlItemId: match.id, permalink: match.permalink });
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

function serializeAccount(account: { mlUserId: string; nickname: string; expiresAt: Date; scope: string }) {
  return {
    connected: true,
    mlUserId: account.mlUserId,
    nickname: account.nickname,
    expiresAt: account.expiresAt,
    scope: account.scope,
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

mercadoLivreRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const account = await getActiveAccount();
    res.json(account ? serializeAccount(account) : { connected: false });
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
