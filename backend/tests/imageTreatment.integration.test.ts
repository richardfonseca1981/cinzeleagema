import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import sharp from "sharp";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/lib/env";
import { interpretPhotoInstruction } from "../src/lib/claude";
import { removeBackground } from "../src/lib/rembg";
import { HttpError } from "../src/middleware/errorHandler";
import { cleanDatabase, generateTestToken } from "./helpers";

// Testes de integração REAIS: fazem chamadas de rede de verdade à Anthropic
// API (consome créditos) e ao microserviço rembg. Por isso ficam fora de
// tests/**/*.test.ts (não rodam com `npm run test:backend`) — só rodam com
// `npm run test:integration`, que aponta para vitest.integration.config.ts.
// Ver README, seção "Testes de integração reais".

const ANTHROPIC_AVAILABLE = Boolean(env.ANTHROPIC_API_KEY);
const REMBG_URL = env.REMBG_SERVICE_URL;

async function isRembgReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${REMBG_URL.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Probe roda na coleta do arquivo (top-level await) porque `it.skipIf` avalia
// a condição imediatamente — um `beforeAll` async rodaria tarde demais para
// decidir se o teste deve ser pulado.
const REMBG_AVAILABLE = await isRembgReachable();

async function makeTestImage(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 220, g: 30, b: 60 } },
  })
    .png()
    .toBuffer();
}

if (!ANTHROPIC_AVAILABLE) {
  console.warn(
    "[integration] ANTHROPIC_API_KEY ausente em backend/.env — teste de chamada real à Claude API será pulado."
  );
}
if (!REMBG_AVAILABLE) {
  console.warn(
    `[integration] rembg não respondeu em ${REMBG_URL} — teste de remoção de fundo real será pulado. Suba com "docker compose up -d rembg".`
  );
}

describe("Claude API real — interpretação de instrução de tratamento de foto", () => {
  it.skipIf(!ANTHROPIC_AVAILABLE)(
    "traduz um pedido em texto para operações estruturadas válidas (ou unclear)",
    async () => {
      const result = await interpretPhotoInstruction("deixa a imagem mais nítida");

      expect(typeof result.unclear).toBe("boolean");

      if (result.unclear) {
        // Resposta válida mesmo se a IA marcar como pouco clara — o que este
        // teste garante é o FORMATO da resposta, não o conteúdo exato
        // (a interpretação da IA não é determinística).
        expect(result.suggestion === undefined || typeof result.suggestion === "string").toBe(true);
      } else {
        const allowedOperations = [
          "resize",
          "crop",
          "brightness",
          "contrast",
          "sharpen",
          "rotate",
          "compress",
          "convertFormat",
          "removeBackground",
        ];

        expect(Array.isArray(result.operations)).toBe(true);
        expect(result.operations.length).toBeGreaterThan(0);
        for (const op of result.operations) {
          expect(allowedOperations).toContain(op.operation);
        }
      }
    }
  );
});

describe("rembg real — remoção de fundo", () => {
  it.skipIf(!REMBG_AVAILABLE)(
    "envia uma imagem ao microserviço rembg e recebe de volta um PNG com fundo removido",
    async () => {
      const original = await makeTestImage();
      const processed = await removeBackground(original);

      expect(Buffer.isBuffer(processed)).toBe(true);
      expect(processed.length).toBeGreaterThan(0);

      const meta = await sharp(processed).metadata();
      expect(meta.format).toBe("png");
      // rembg devolve PNG com canal alpha — é o sinal de que o fundo foi removido
      expect(meta.hasAlpha).toBe(true);
    }
  );

  it("retorna erro tratado (502), sem travar, quando o serviço está inacessível", async () => {
    const originalUrl = env.REMBG_SERVICE_URL;
    env.REMBG_SERVICE_URL = "http://127.0.0.1:19998"; // porta sem nada escutando

    try {
      const original = await makeTestImage();
      await expect(removeBackground(original)).rejects.toBeInstanceOf(HttpError);
      await expect(removeBackground(original)).rejects.toMatchObject({ status: 502 });
    } finally {
      env.REMBG_SERVICE_URL = originalUrl;
    }
  });
});

describe("Rota /treatment/preview — fallback quando ANTHROPIC_API_KEY está ausente", () => {
  const app = createApp();
  const token = generateTestToken();

  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it("responde 503 (não crasha, não chama a Claude API) quando a chave está ausente", async () => {
    const category = await prisma.category.create({ data: { name: "Homedecor", slug: "homedecor" } });
    const product = await prisma.product.create({
      data: {
        name: "Peça de teste — tratamento de foto",
        slug: `peca-teste-tratamento-${Date.now()}`,
        price: 100,
        trackStock: false,
        categoryId: category.id,
      },
    });
    const image = await prisma.productImage.create({
      data: {
        productId: product.id,
        url: "https://example.com/fake.jpg",
        key: "fake/fake.jpg",
        position: 0,
      },
    });

    const originalKey = env.ANTHROPIC_API_KEY;
    env.ANTHROPIC_API_KEY = "";

    try {
      const res = await request(app)
        .post(`/api/products/${product.id}/images/${image.id}/treatment/preview`)
        .set("Authorization", `Bearer ${token}`)
        .send({ instruction: "deixa mais nítida" });

      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/ANTHROPIC_API_KEY/);
    } finally {
      env.ANTHROPIC_API_KEY = originalKey;
    }
  });
});
