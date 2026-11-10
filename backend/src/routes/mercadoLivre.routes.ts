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

// Fase 0: só conexão/leitura, nenhuma publicação de anúncio. Todas as rotas
// exigem admin (requireAuth) — inclusive /callback: o ML_REDIRECT_URI deve
// apontar para uma página do admin (frontend) que lê code/state da URL e
// repassa para esta rota já com o Authorization: Bearer do admin logado (ver
// CONTEXT.md e o relatório da Fase 0). Um GET direto do navegador sem esse
// header nunca vai autenticar — é a decisão deliberada para manter
// requireAuth em todas as rotas, como pedido.
export const mercadoLivreRouter = Router();
mercadoLivreRouter.use(requireAuth);

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
