import { afterEach, describe, expect, it, vi } from "vitest";
import "./setup";
import { decryptToken, encryptToken, isMercadoLivreConfigured } from "../src/lib/mercadoLivre/crypto";

afterEach(() => {
  vi.doUnmock("../src/lib/env");
  vi.resetModules();
});

describe("mercadoLivre crypto", () => {
  it("ida e volta preserva o valor original", () => {
    const original = "APP_USR-1234567890123456-111111-abcdef0123456789abcdef0123456789-999999999";
    const encrypted = encryptToken(original);
    expect(encrypted).not.toBe(original);
    expect(decryptToken(encrypted)).toBe(original);
  });

  it("gera ciphertext diferente a cada chamada (iv aleatório)", () => {
    const a = encryptToken("mesmo-valor");
    const b = encryptToken("mesmo-valor");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("mesmo-valor");
    expect(decryptToken(b)).toBe("mesmo-valor");
  });

  it("detecta adulteração do ciphertext (GCM auth tag não confere)", () => {
    const encrypted = encryptToken("valor-sensivel");
    const [iv, authTag, ciphertext] = encrypted.split(":");
    const tamperedCiphertext = Buffer.from(ciphertext, "base64");
    tamperedCiphertext[0] ^= 0xff;
    const tampered = [iv, authTag, tamperedCiphertext.toString("base64")].join(":");

    expect(() => decryptToken(tampered)).toThrow();
  });

  it("isMercadoLivreConfigured reflete as env vars ML_* presentes", () => {
    expect(isMercadoLivreConfigured()).toBe(true);
  });

  it("lança erro claro ao cifrar sem ML_TOKEN_ENC_KEY configurada", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/env", () => ({
      env: { ML_TOKEN_ENC_KEY: "", ML_APP_ID: "", ML_CLIENT_SECRET: "", ML_REDIRECT_URI: "" },
    }));

    const fresh = await import("../src/lib/mercadoLivre/crypto");
    expect(() => fresh.encryptToken("x")).toThrow(/ML_TOKEN_ENC_KEY/);
    expect(fresh.isMercadoLivreConfigured()).toBe(false);
  });
});
