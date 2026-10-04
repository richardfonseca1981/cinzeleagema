import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

// Só o rembg é mockado (ele localiza a peça em fotos opacas); Sharp roda de verdade.
vi.mock("../src/lib/rembg", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/rembg")>();
  return { ...actual, removeBackground: vi.fn() };
});

import { removeBackground } from "../src/lib/rembg";
import {
  AUTOFIT_ALREADY_FITTED_COVERAGE,
  AUTOFIT_MIN_RESULT_LONG_SIDE_PX,
  AUTOFIT_PADDING_RATIO,
  AUTOFIT_REMBG_MAX_RETRIES,
  autoFitSubject,
  describeAutoFit,
  findSubjectBox,
} from "../src/lib/autoFit";

const mockedRembg = vi.mocked(removeBackground);

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const SUBJECT = { r: 120, g: 60, b: 200 };

// RGBA com fundo transparente e retângulos opacos (a "peça" e, se pedido, respingos).
async function transparentPng(width: number, height: number, rects: Rect[], format: "png" | "webp" = "png"): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4);
  for (const rect of rects) {
    for (let y = rect.top; y < rect.top + rect.height; y++) {
      for (let x = rect.left; x < rect.left + rect.width; x++) {
        const i = (y * width + x) * 4;
        raw[i] = SUBJECT.r;
        raw[i + 1] = SUBJECT.g;
        raw[i + 2] = SUBJECT.b;
        raw[i + 3] = 255;
      }
    }
  }
  const img = sharp(raw, { raw: { width, height, channels: 4 } });
  return format === "png" ? img.png().toBuffer() : img.webp({ lossless: true }).toBuffer();
}

// Foto opaca: fundo cinza com a peça colorida num retângulo.
async function opaquePhoto(width: number, height: number, rect: Rect, format: "jpeg" | "webp" | "png" = "jpeg"): Promise<Buffer> {
  const base = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } } });
  const piece = await sharp({ create: { width: rect.width, height: rect.height, channels: 3, background: SUBJECT } }).png().toBuffer();
  const img = base.composite([{ input: piece, left: rect.left, top: rect.top }]);
  if (format === "jpeg") return img.jpeg({ quality: 95 }).toBuffer();
  if (format === "webp") return img.webp({ quality: 95 }).toBuffer();
  return img.png().toBuffer();
}

// O que o rembg devolveria: PNG com alpha, peça opaca e o resto transparente.
async function rembgMaskFor(width: number, height: number, rect: Rect): Promise<Buffer> {
  return transparentPng(width, height, [rect]);
}

async function countOpaqueSubjectPixels(buffer: Buffer): Promise<number> {
  const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200 && data[i] === SUBJECT.r && data[i + 1] === SUBJECT.g && data[i + 2] === SUBJECT.b) n++;
  }
  return n;
}

beforeEach(() => {
  mockedRembg.mockReset();
});

describe("findSubjectBox (função pura)", () => {
  function alphaWith(width: number, height: number, rects: Rect[]): Uint8Array {
    const a = new Uint8Array(width * height);
    for (const r of rects) for (let y = r.top; y < r.top + r.height; y++) for (let x = r.left; x < r.left + r.width; x++) a[y * width + x] = 255;
    return a;
  }

  it("devolve a caixa exata da peça", () => {
    expect(findSubjectBox(alphaWith(100, 80, [{ left: 30, top: 20, width: 40, height: 30 }]), 100, 80)).toEqual({
      left: 30,
      top: 20,
      width: 40,
      height: 30,
    });
  });

  it("ignora um respingo isolado menor que o mínimo por linha/coluna", () => {
    const a = alphaWith(1000, 800, [
      { left: 300, top: 200, width: 300, height: 300 },
      { left: 950, top: 750, width: 2, height: 2 },
    ]);
    expect(findSubjectBox(a, 1000, 800)).toEqual({ left: 300, top: 200, width: 300, height: 300 });
  });

  it("devolve null quando não há peça", () => {
    expect(findSubjectBox(new Uint8Array(50 * 50), 50, 50)).toBeNull();
  });
});

describe("autoFitSubject — PNG com transparência", () => {
  // 2000x1600, peça 500x400 descentralizada (cobertura 6,25%).
  const subject: Rect = { left: 1300, top: 200, width: 500, height: 400 };

  it("recorta em volta da peça com folga de 12% do maior lado, sem esticar e mantendo o alpha", async () => {
    const input = await transparentPng(2000, 1600, [subject]);
    const result = await autoFitSubject(input);

    const pad = Math.round(AUTOFIT_PADDING_RATIO * 500); // 60
    expect(result.action).toBe("cropped");
    expect(result.contentType).toBe("image/png");
    expect(result.before).toMatchObject({ w: 2000, h: 1600 });
    expect(result.before.coverage).toBeCloseTo(0.0625, 4);
    expect(result.after).toMatchObject({ w: 500 + 2 * pad, h: 400 + 2 * pad });
    expect(result.after.coverage!).toBeGreaterThan(0.3);

    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
    expect({ w: meta.width, h: meta.height }).toEqual({ w: 620, h: 520 });

    // Sem esticar nem ampliar: a peça tem exatamente os mesmos 500x400 pixels.
    expect(await countOpaqueSubjectPixels(result.buffer)).toBe(500 * 400);
  });

  it("nunca amplia: o resultado não é maior que o original", async () => {
    const result = await autoFitSubject(await transparentPng(2000, 1600, [subject]));
    expect(result.after.w).toBeLessThanOrEqual(2000);
    expect(result.after.h).toBeLessThanOrEqual(1600);
  });

  it("ignora um respingo isolado: a caixa é a mesma com ou sem ele", async () => {
    const clean = await autoFitSubject(await transparentPng(2000, 1600, [subject]));
    const splash = await autoFitSubject(await transparentPng(2000, 1600, [subject, { left: 60, top: 1500, width: 3, height: 3 }]));
    expect(splash.action).toBe("cropped");
    expect(splash.after).toEqual(clean.after);
  });

  it("estende a tela com transparência quando a folga passa da borda (não corta a peça)", async () => {
    // Peça colada a 10 px da borda esquerda: folga de 60 px passa 50 px da borda.
    const input = await transparentPng(2000, 1600, [{ left: 10, top: 400, width: 500, height: 400 }]);
    const result = await autoFitSubject(input);

    expect(result.action).toBe("cropped");
    expect(result.after).toMatchObject({ w: 620, h: 520 });
    expect(await countOpaqueSubjectPixels(result.buffer)).toBe(500 * 400);

    // A faixa estendida à esquerda é transparente.
    const { data, info } = await sharp(result.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let y = 0; y < info.height; y += 37) expect(data[(y * info.width + 0) * 4 + 3]).toBe(0);
  });

  it("funciona também com WebP transparente e mantém o formato WebP", async () => {
    const result = await autoFitSubject(await transparentPng(2000, 1600, [subject], "webp"));
    expect(result.action).toBe("cropped");
    expect(result.contentType).toBe("image/webp");
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.hasAlpha).toBe(true);
  });

  it("não chama o rembg (a própria transparência já localiza a peça)", async () => {
    await autoFitSubject(await transparentPng(2000, 1600, [subject]));
    expect(mockedRembg).not.toHaveBeenCalled();
  });
});

describe("autoFitSubject — sem recorte", () => {
  it("já enquadrada (caixa > 70% da área): unchanged/already_fitted e devolve o buffer original", async () => {
    const input = await transparentPng(2000, 1600, [{ left: 100, top: 100, width: 1800, height: 1400 }]);
    const result = await autoFitSubject(input);

    expect(result.before.coverage!).toBeGreaterThan(AUTOFIT_ALREADY_FITTED_COVERAGE);
    expect(result).toMatchObject({ action: "unchanged", reason: "already_fitted" });
    expect(result.buffer).toBe(input);
    expect(result.after).toEqual(result.before);
  });

  it("pequena demais: o resultado ficaria < 500 px no maior lado → skipped/too_small_after_crop", async () => {
    const input = await transparentPng(600, 500, [{ left: 350, top: 50, width: 200, height: 150 }]);
    const result = await autoFitSubject(input);

    expect(result).toMatchObject({ action: "skipped", reason: "too_small_after_crop" });
    expect(result.buffer).toBe(input);
    expect(AUTOFIT_MIN_RESULT_LONG_SIDE_PX).toBe(500);
  });

  it("imagem totalmente transparente: skipped/subject_not_found, sem lançar", async () => {
    const result = await autoFitSubject(await transparentPng(800, 800, []));
    expect(result).toMatchObject({ action: "skipped", reason: "subject_not_found" });
  });

  it("formato não suportado (GIF): skipped/unsupported_format, sem lançar", async () => {
    const gif = await sharp({ create: { width: 50, height: 50, channels: 3, background: SUBJECT } }).gif().toBuffer();
    const result = await autoFitSubject(gif);
    expect(result).toMatchObject({ action: "skipped", reason: "unsupported_format" });
  });
});

describe("autoFitSubject — foto opaca (rembg só localiza a peça)", () => {
  // 1600x1200, fundo cinza, peça colorida 600x450 em (900, 100).
  const subject: Rect = { left: 900, top: 100, width: 600, height: 450 };

  it("recorta a foto ORIGINAL: continua JPEG, sem transparência, com o fundo original nas bordas", async () => {
    const input = await opaquePhoto(1600, 1200, subject);
    mockedRembg.mockResolvedValue(await rembgMaskFor(1600, 1200, subject));

    const result = await autoFitSubject(input);

    const pad = Math.round(AUTOFIT_PADDING_RATIO * 600); // 72
    expect(result.action).toBe("cropped");
    expect(result.contentType).toBe("image/jpeg");
    expect(mockedRembg).toHaveBeenCalledTimes(1);
    expect(result.after).toMatchObject({ w: 600 + 2 * pad, h: 450 + 2 * pad });

    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.hasAlpha).toBe(false);
    expect({ w: meta.width, h: meta.height }).toEqual({ w: 744, h: 594 });

    // O fundo cinza ORIGINAL foi mantido (nunca entrega a versão sem fundo).
    const { data, info } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
    for (const [x, y] of [[3, 3], [info.width - 4, info.height - 4]]) {
      const i = (y * info.width + x) * info.channels;
      expect(Math.abs(data[i] - 200)).toBeLessThan(6);
      expect(Math.abs(data[i + 1] - 200)).toBeLessThan(6);
    }
  });

  it("limita a folga às bordas da foto (peça perto da borda não estende a tela)", async () => {
    const edge: Rect = { left: 20, top: 20, width: 600, height: 450 };
    mockedRembg.mockResolvedValue(await rembgMaskFor(1600, 1200, edge));
    const result = await autoFitSubject(await opaquePhoto(1600, 1200, edge));

    expect(result.action).toBe("cropped");
    // esquerda/topo limitados a 0: largura = 20 + 600 + 72, altura = 20 + 450 + 72.
    expect(result.after).toMatchObject({ w: 692, h: 542 });
    expect((await sharp(result.buffer).metadata()).hasAlpha).toBe(false);
  });

  it("mantém WebP como WebP e PNG opaco como PNG", async () => {
    mockedRembg.mockResolvedValue(await rembgMaskFor(1600, 1200, subject));
    const webp = await autoFitSubject(await opaquePhoto(1600, 1200, subject, "webp"));
    expect(webp.contentType).toBe("image/webp");
    expect((await sharp(webp.buffer).metadata()).format).toBe("webp");

    const png = await autoFitSubject(await opaquePhoto(1600, 1200, subject, "png"));
    expect(png.contentType).toBe("image/png");
    expect((await sharp(png.buffer).metadata()).format).toBe("png");
  });

  it("rembg indisponível: skipped/rembg_unavailable, sem lançar, com 1 nova tentativa", async () => {
    mockedRembg.mockRejectedValue(new Error("502"));
    const input = await opaquePhoto(1600, 1200, subject);

    const result = await autoFitSubject(input);

    expect(result).toMatchObject({ action: "skipped", reason: "rembg_unavailable" });
    expect(result.buffer).toBe(input);
    expect(mockedRembg).toHaveBeenCalledTimes(1 + AUTOFIT_REMBG_MAX_RETRIES);
  });

  it("se o rembg falhar na 1ª e responder na 2ª tentativa, recorta normalmente", async () => {
    mockedRembg.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(await rembgMaskFor(1600, 1200, subject));
    const result = await autoFitSubject(await opaquePhoto(1600, 1200, subject));
    expect(result.action).toBe("cropped");
    expect(mockedRembg).toHaveBeenCalledTimes(2);
  });

  it("passa um timeout ao rembg", async () => {
    mockedRembg.mockResolvedValue(await rembgMaskFor(1600, 1200, subject));
    await autoFitSubject(await opaquePhoto(1600, 1200, subject));
    expect(mockedRembg.mock.calls[0][1]).toMatchObject({ timeoutMs: expect.any(Number) });
  });

  it("rembg que não acha a peça (tudo transparente): skipped/subject_not_found", async () => {
    mockedRembg.mockResolvedValue(await transparentPng(1600, 1200, []));
    const result = await autoFitSubject(await opaquePhoto(1600, 1200, subject));
    expect(result).toMatchObject({ action: "skipped", reason: "subject_not_found" });
  });

  it("opts.removeBackground substitui o rembg (injeção para scripts/testes)", async () => {
    const custom = vi.fn().mockResolvedValue(await rembgMaskFor(1600, 1200, subject));
    const result = await autoFitSubject(await opaquePhoto(1600, 1200, subject), { removeBackground: custom });
    expect(result.action).toBe("cropped");
    expect(custom).toHaveBeenCalledTimes(1);
    expect(mockedRembg).not.toHaveBeenCalled();
  });
});

describe("describeAutoFit — mensagens em português", () => {
  it("explica cada razão de não recortar, em linguagem clara", async () => {
    const fitted = await autoFitSubject(await transparentPng(2000, 1600, [{ left: 100, top: 100, width: 1800, height: 1400 }]));
    expect(describeAutoFit(fitted)).toBe("A peça já ocupa bem o quadro — não há o que enquadrar.");

    const tiny = await autoFitSubject(await transparentPng(600, 500, [{ left: 350, top: 50, width: 200, height: 150 }]));
    expect(describeAutoFit(tiny)).toMatch(/pequena demais/);

    mockedRembg.mockRejectedValue(new Error("x"));
    const down = await autoFitSubject(await opaquePhoto(1600, 1200, { left: 900, top: 100, width: 600, height: 450 }));
    expect(describeAutoFit(down)).toMatch(/serviço de remoção de fundo indisponível/);
  });

  it("descreve o ganho de cobertura quando recorta", async () => {
    const cropped = await autoFitSubject(await transparentPng(2000, 1600, [{ left: 1300, top: 200, width: 500, height: 400 }]));
    expect(describeAutoFit(cropped)).toMatch(/Peça enquadrada: ocupava 6% do quadro e agora ocupa \d+%/);
  });
});
