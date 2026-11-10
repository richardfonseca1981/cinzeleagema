import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "../env";

// Cifra tokens do Mercado Livre em repouso (AES-256-GCM). A chave real é o
// SHA-256 de ML_TOKEN_ENC_KEY — assim a env var pode ser qualquer string
// (não precisa ser exatamente 32 bytes em base64/hex) e ainda vira uma chave
// de 256 bits válida. Formato armazenado: "<iv>:<authTag>:<ciphertext>", tudo
// em base64.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  if (!env.ML_TOKEN_ENC_KEY) {
    throw new Error("ML_TOKEN_ENC_KEY não configurada — conexão com o Mercado Livre está desabilitada");
  }
  return createHash("sha256").update(env.ML_TOKEN_ENC_KEY).digest();
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
