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

  it("lança erro claro quando ML_TOKEN_ENC_KEY não decodifica para 32 bytes", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/env", () => ({
      env: {
        ML_TOKEN_ENC_KEY: "fnPzj1qfOZYNDpAo2474DQ==", // 16 bytes, não 32
        ML_APP_ID: "x",
        ML_CLIENT_SECRET: "x",
        ML_REDIRECT_URI: "x",
      },
    }));

    const fresh = await import("../src/lib/mercadoLivre/crypto");
    expect(() => fresh.encryptToken("x")).toThrow(/32 bytes/);
    // Nunca expor o valor da chave na mensagem de erro.
    try {
      fresh.encryptToken("x");
    } catch (err) {
      expect(String((err as Error).message)).not.toContain("fnPzj1qfOZYNDpAo2474DQ");
    }
  });

  it("lança erro claro quando ML_TOKEN_ENC_KEY não é base64 válido", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/env", () => ({
      env: {
        ML_TOKEN_ENC_KEY: "isso não é base64 !!! @@@",
        ML_APP_ID: "x",
        ML_CLIENT_SECRET: "x",
        ML_REDIRECT_URI: "x",
      },
    }));

    const fresh = await import("../src/lib/mercadoLivre/crypto");
    expect(() => fresh.encryptToken("x")).toThrow(/base64/);
  });

  it("round-trip funciona com uma chave de exatamente 32 bytes em base64", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/env", () => ({
      env: {
        ML_TOKEN_ENC_KEY: "pI/QtQbMld2Mzfddx/Lxpo6/asHLEkO0+4j51YUWTx0=",
        ML_APP_ID: "x",
        ML_CLIENT_SECRET: "x",
        ML_REDIRECT_URI: "x",
      },
    }));

    const fresh = await import("../src/lib/mercadoLivre/crypto");
    const encrypted = fresh.encryptToken("valor-secreto");
    expect(fresh.decryptToken(encrypted)).toBe("valor-secreto");
  });
});
