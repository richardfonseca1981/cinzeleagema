import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Permite apontar os testes de integração para um banco de dados dedicado,
// evitando apagar dados de desenvolvimento a cada execução.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Valores fake só para os testes do Mercado Livre terem a integração
// "configurada" (ver lib/mercadoLivre/) sem depender de credenciais reais no
// .env local — nunca usados para chamar a API real (fetch é sempre mockado).
process.env.ML_APP_ID ||= "1234567890123456";
process.env.ML_CLIENT_SECRET ||= "test-client-secret";
process.env.ML_REDIRECT_URI ||= "https://admin.cinzeleagema.com.br/mercadolivre/callback";
process.env.ML_TOKEN_ENC_KEY ||= "test-encryption-passphrase-do-not-use-in-prod";
