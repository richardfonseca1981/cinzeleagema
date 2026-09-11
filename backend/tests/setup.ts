import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Permite apontar os testes de integração para um banco de dados dedicado,
// evitando apagar dados de desenvolvimento a cada execução.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
