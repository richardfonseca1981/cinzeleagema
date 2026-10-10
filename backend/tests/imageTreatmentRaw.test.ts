import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import "./setup";

// Mocka só a interpretação (Claude) e o microserviço de remoção de fundo
// (rembg) — o resto (multer, validação zod, execução via Sharp) roda de
// verdade, provando que a rota realmente processa a imagem recebida.
vi.mock("../src/lib/claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/claude")>();
  return { ...actual, interpretPhotoInstruction: vi.fn() };
});
vi.mock("../src/lib/rembg", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/rembg")>();
  return { ...actual, removeBackground: vi.fn() };
});

import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/lib/env";
import { interpretPhotoInstruction } from "../src/lib/claude";
import { removeBackground } from "../src/lib/rembg";
import * as r2 from "../src/lib/r2";
import { cleanDatabase, generateTestToken } from "./helpers";

const mockedInterpret = vi.mocked(interpretPhotoInstruction);
const mockedRemoveBackground = vi.mocked(removeBackground);

async function makeTestImage(): Promise<Buffer> {
  return sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();
}

// O setup padrão zera ANTHROPIC_API_KEY (nenhum teste chama a API real). Aqui a
// interpretação é mockada, mas a rota ainda exige "IA configurada": usa uma
// chave FALSA, que nunca sai do processo porque interpretPhotoInstruction é mock.
env.ANTHROPIC_API_KEY = "chave-falsa-de-teste";

const app = createApp();
const token = generateTestToken();

beforeAll(async () => {
  await cleanDatabase();
});

afterEach(() => {
  mockedInterpret.mockReset();
  mockedRemoveBackground.mockReset();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("POST /api/images/treatment-preview-raw", () => {
  it("rejeita sem token de autenticação", async () => {
    const res = await request(app).post("/api/images/treatment-preview-raw").field("instruction", "nitidez");
    expect(res.status).toBe(401);
  });

  it("responde 503 quando ANTHROPIC_API_KEY está ausente, sem chamar a IA", async () => {
    const originalKey = env.ANTHROPIC_API_KEY;
    env.ANTHROPIC_API_KEY = "";

    try {
      const image = await makeTestImage();
      const res = await request(app)
        .post("/api/images/treatment-preview-raw")
        .set("Authorization", `Bearer ${token}`)
        .field("instruction", "deixa mais nítida")
        .attach("file", image, "foto.jpg");

      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/ANTHROPIC_API_KEY/);
      expect(mockedInterpret).not.toHaveBeenCalled();
    } finally {
      env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it("processa uma operação simples (sharpen) e devolve a imagem tratada em base64", async () => {
    mockedInterpret.mockResolvedValue({
      unclear: false,
      operations: [{ operation: "sharpen", intensity: "leve" }],
    });

    const image = await makeTestImage();
    const res = await request(app)
      .post("/api/images/treatment-preview-raw")
      .set("Authorization", `Bearer ${token}`)
      .field("instruction", "deixa mais nítida")
      .attach("file", image, "foto.jpg");

    expect(res.status).toBe(200);
    expect(res.body.unclear).toBe(false);
    expect(res.body.operations).toEqual([{ operation: "sharpen", intensity: "leve" }]);
    expect(res.body.previewDataUrl).toMatch(/^data:image\/webp;base64,/);

    const base64 = res.body.previewDataUrl.split(",")[1];
    const resultBuffer = Buffer.from(base64, "base64");
    const meta = await sharp(resultBuffer).metadata();
    // 40×40 vira 9:16 (40×72): foto inteira num canvas em pé, sem ampliar
    expect(meta.width).toBe(40);
    expect(meta.height).toBe(72);
  });

  it("processa removeBackground via rembg (mockado) e devolve a imagem em 9:16", async () => {
    mockedInterpret.mockResolvedValue({ unclear: false, operations: [{ operation: "removeBackground" }] });

    const transparentPng = await sharp({
      create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    mockedRemoveBackground.mockResolvedValue(transparentPng);

    const image = await makeTestImage();
    const res = await request(app)
      .post("/api/images/treatment-preview-raw")
      .set("Authorization", `Bearer ${token}`)
      .field("instruction", "remove o fundo")
      .attach("file", image, "foto.jpg");

    expect(res.status).toBe(200);
    expect(res.body.unclear).toBe(false);
    expect(mockedRemoveBackground).toHaveBeenCalledTimes(1);
    expect(res.body.previewDataUrl).toMatch(/^data:image\/webp;base64,/);

    const base64 = res.body.previewDataUrl.split(",")[1];
    const resultBuffer = Buffer.from(base64, "base64");
    const meta = await sharp(resultBuffer).metadata();
    // todo tratamento sai em 9:16
    expect(meta.width! / meta.height!).toBeCloseTo(9 / 16, 1);
  });

  it("retorna unclear sem processar a imagem quando o pedido é pouco claro", async () => {
    mockedInterpret.mockResolvedValue({ unclear: true, suggestion: "tente descrever melhor" });

    const image = await makeTestImage();
    const res = await request(app)
      .post("/api/images/treatment-preview-raw")
      .set("Authorization", `Bearer ${token}`)
      .field("instruction", "deixa bonita")
      .attach("file", image, "foto.jpg");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ unclear: true, suggestion: "tente descrever melhor" });
    expect(mockedRemoveBackground).not.toHaveBeenCalled();
  });

  it("não grava nada no banco nem chama o R2 durante a chamada", async () => {
    mockedInterpret.mockResolvedValue({
      unclear: false,
      operations: [{ operation: "sharpen", intensity: "leve" }],
    });
    const putObjectSpy = vi.spyOn(r2, "putObject");
    const getObjectSpy = vi.spyOn(r2, "getObject");
    const deleteObjectSpy = vi.spyOn(r2, "deleteObject");

    const image = await makeTestImage();
    const res = await request(app)
      .post("/api/images/treatment-preview-raw")
      .set("Authorization", `Bearer ${token}`)
      .field("instruction", "deixa mais nítida")
      .attach("file", image, "foto.jpg");

    expect(res.status).toBe(200);
    expect(putObjectSpy).not.toHaveBeenCalled();
    expect(getObjectSpy).not.toHaveBeenCalled();
    expect(deleteObjectSpy).not.toHaveBeenCalled();
    expect(await prisma.productImage.count()).toBe(0);
    expect(await prisma.product.count()).toBe(0);
  });

  it("rejeita quando nenhum arquivo é enviado", async () => {
    const res = await request(app)
      .post("/api/images/treatment-preview-raw")
      .set("Authorization", `Bearer ${token}`)
      .field("instruction", "deixa mais nítida");

    expect(res.status).toBe(400);
    expect(mockedInterpret).not.toHaveBeenCalled();
  });
});
