// Fixture da Fase 1A (ver CONTEXT.md "Mercado Livre — Fase 1A"). Os
// endpoints públicos de categoria do Mercado Livre (GET /sites/MLB/categories,
// GET /sites/MLB/domain_discovery/search) responderam 403
// "PA_UNAUTHORIZED_RESULT_FROM_POLICIES" (bloqueio anti-bot) em todas as
// tentativas feitas durante o planejamento desta fase, por dois caminhos de
// rede independentes — por isso o id abaixo é um placeholder, NUNCA validado
// contra a API real. A trilha de navegação (breadcrumb) foi confirmada via
// páginas públicas de listagem (não-API) em lista.mercadolivre.com.br, que
// carregaram normalmente — só o texto, não o id numérico real da categoria.
//
// Confirmar o id real via GET /categories/{id}/attributes (autenticado, Fase
// 1B) antes de qualquer publicação de anúncio — ver assertReadyToPublish em
// listingBuilder.ts, que bloqueia a publicação enquanto `verified` for false.
export const ML_FIXME_CATEGORY_ID = "MLB_FIXME_CATEGORY_ID";

export interface MercadoLivreCategoryFixture {
  id: string;
  breadcrumb: string[];
  verified: boolean;
}

export const GEMSTONE_CATEGORY_FIXTURE: MercadoLivreCategoryFixture = {
  id: ML_FIXME_CATEGORY_ID,
  breadcrumb: ["Joias e Relógios", "Pedras Preciosas", "Gemas Brutas"],
  verified: false,
};
