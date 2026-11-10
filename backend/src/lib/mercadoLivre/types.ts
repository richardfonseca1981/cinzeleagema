// Formato confirmado em developers.mercadolivre.com.br/pt_br/obtencao-do-access-token
// (POST https://api.mercadolibre.com/oauth/token).
export interface MercadoLivreTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
}

// Formato confirmado em developers.mercadolivre.com.br (GET /users/me) — só
// os campos usados na Fase 0.
export interface MercadoLivreUserMe {
  id: number;
  nickname: string;
}
