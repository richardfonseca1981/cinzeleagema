import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "../env";

// Cifra tokens do Mercado Livre em repouso (AES-256-GCM). ML_TOKEN_ENC_KEY
// precisa ser, ela mesma, a chave de 256 bits (32 bytes) em base64 — sem
// derivação (nada de hash) — para que a chave usada seja exatamente a que o
// operador gerou e guardou. Formato armazenado: "<iv>:<authTag>:<ciphertext>",
// tudo em base64.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH_BYTES = 32;

// Nunca incluir env.ML_TOKEN_ENC_KEY (nem `raw`) nas mensagens de erro abaixo
// — só o fato de estar ausente/malformada, nunca o valor.
function getKey(): Buffer {
  const raw = env.ML_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error("ML_TOKEN_ENC_KEY não configurada — conexão com o Mercado Livre está desabilitada");
  }

  const decoded = Buffer.from(raw, "base64");
  // Node ignora silenciosamente caracteres fora do alfabeto base64 em vez de
  // lançar — comparar o reencode com o valor original é o jeito confiável de
  // detectar que `raw` não era base64 válido.
  if (decoded.toString("base64") !== raw) {
    throw new Error("ML_TOKEN_ENC_KEY inválida — não é uma string base64 válida");
  }
  if (decoded.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `ML_TOKEN_ENC_KEY inválida — deve decodificar para exatamente ${KEY_LENGTH_BYTES} bytes (recebeu ${decoded.length})`
    );
  }
  return decoded;
}

export function encryptToken(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptToken(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Formato inválido de token cifrado do Mercado Livre");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

export function isMercadoLivreConfigured(): boolean {
  return Boolean(env.ML_APP_ID && env.ML_CLIENT_SECRET && env.ML_REDIRECT_URI && env.ML_TOKEN_ENC_KEY);
}
