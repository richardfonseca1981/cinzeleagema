import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
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
import { buildListingDraft } from "../lib/mercadoLivre/listingBuilder";
import {
  calculateSuggestedPrice,
  UNVERIFIED_DEFAULT_COMMISSION_PCT,
  UNVERIFIED_DEFAULT_FIXED_FEE_BRL,
  UNVERIFIED_DEFAULT_SHIPPING_COST_BRL,
} from "../lib/mercadoLivre/priceCalculator";
import { mercadoLivreSimulateQuerySchema } from "../schemas/mercadoLivreSimulate.schema";

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

    const commissionPct = query.commissionPct ?? UNVERIFIED_DEFAULT_COMMISSION_PCT;
    const fixedFeeBRL = query.fixedFeeBRL ?? UNVERIFIED_DEFAULT_FIXED_FEE_BRL;
    const shippingCostBRL = query.shippingCostBRL ?? UNVERIFIED_DEFAULT_SHIPPING_COST_BRL;
    const price = calculateSuggestedPrice(Number(product.price), {
      markupPct: query.markupPct,
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
