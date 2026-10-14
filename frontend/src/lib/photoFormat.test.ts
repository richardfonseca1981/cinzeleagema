import { describe, expect, it } from "vitest";
import { MAX_PHOTOS_PER_PRODUCT, PHOTO_GUIDANCE, maxPhotosMessage, isPortrait916, photoFileError, photoFormatWarnings, PHOTO_ASPECT_CSS } from "./photoFormat";

describe("photoFormatWarnings", () => {
  it("720×1280 exatos não geram aviso", () => {
    expect(photoFormatWarnings(720, 1280)).toEqual([]);
  });

  it("4536×8064 (iPhone, 16:9 em pé) não gera aviso", () => {
    expect(photoFormatWarnings(4536, 8064)).toEqual([]);
  });

  it("dentro de 3% de 9:16 não avisa de proporção", () => {
    expect(photoFormatWarnings(740, 1280).map((w) => w.kind)).toEqual([]);
    expect(photoFormatWarnings(720, 1300).map((w) => w.kind)).toEqual([]);
  });

  it("avisa proporção fora de 9:16 (3:4, 4:3 e 1:1)", () => {
    expect(photoFormatWarnings(3024, 4032).map((w) => w.kind)).toEqual(["ratio"]);
    expect(photoFormatWarnings(4032, 3024).map((w) => w.kind)).toEqual(["ratio"]);
    expect(photoFormatWarnings(2000, 2000).map((w) => w.kind)).toEqual(["ratio"]);
  });

  it("avisa tamanho pequeno em 9:16 (360×640) e cita as dimensões", () => {
    const w = photoFormatWarnings(360, 640);
    expect(w.map((x) => x.kind)).toEqual(["small"]);
    expect(w[0].message).toContain("360×640");
    expect(w[0].message).toContain("720×1280");
  });

  it("1 px abaixo do mínimo em 9:16 avisa tamanho", () => {
    expect(photoFormatWarnings(719, 1280).map((w) => w.kind)).toContain("small");
    expect(photoFormatWarnings(720, 1279).map((w) => w.kind)).toContain("small");
  });

  it("foto deitada grande só avisa a proporção; deitada minúscula avisa as duas", () => {
    expect(photoFormatWarnings(1600, 1200).map((w) => w.kind)).toEqual(["ratio"]);
    expect(photoFormatWarnings(400, 300).map((w) => w.kind)).toEqual(["ratio", "small"]);
  });

  it("dimensões inválidas não geram aviso", () => {
    expect(photoFormatWarnings(0, 0)).toEqual([]);
    expect(photoFormatWarnings(NaN, 100)).toEqual([]);
  });
});

describe("isPortrait916 / CSS", () => {
  it("usa a proporção em pé", () => {
    expect(isPortrait916(720, 1280)).toBe(true);
    expect(isPortrait916(1280, 720)).toBe(false);
    expect(PHOTO_ASPECT_CSS).toBe("9 / 16");
  });
});

describe("photoFileError", () => {
  it("recusa HEIC com mensagem clara, por tipo ou extensão", () => {
    expect(photoFileError({ name: "a.heic", type: "", size: 10 })).toMatch(/HEIC/);
    expect(photoFileError({ name: "a.jpg", type: "image/heif", size: 10 })).toMatch(/HEIC/);
  });
  it("aceita JPEG e recusa arquivo grande", () => {
    expect(photoFileError({ name: "a.jpg", type: "image/jpeg", size: 10 })).toBeNull();
    expect(photoFileError({ name: "a.jpg", type: "image/jpeg", size: 16 * 1024 * 1024 })).toMatch(/15 MB/);
  });
});

describe("textos do admin", () => {
  it("orientação de fotografia completa", () => {
    expect(PHOTO_GUIDANCE).toBe(
      "Fotografe com o celular em pé e a proporção 16:9 selecionada na câmera, com a peça centralizada e ocupando cerca de dois terços da largura da foto"
    );
  });
  it("limite de fotos por peça numa constante, com mensagem em português", () => {
    expect(MAX_PHOTOS_PER_PRODUCT).toBe(10);
    expect(maxPhotosMessage()).toBe("Limite de 10 fotos por peça atingido. Apague uma foto antes de adicionar outra.");
  });
});
