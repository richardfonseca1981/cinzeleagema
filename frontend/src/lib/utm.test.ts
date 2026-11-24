import { afterEach, describe, expect, it } from "vitest";
import { captureUtmParams, getStoredUtmParams, hasUtmParams, withUtmFallback } from "./utm";

afterEach(() => {
  sessionStorage.clear();
});

describe("hasUtmParams", () => {
  it("detecta qualquer um dos utm_* conhecidos", () => {
    expect(hasUtmParams("?utm_source=instagram")).toBe(true);
    expect(hasUtmParams("?utm_campaign=novidade")).toBe(true);
    expect(hasUtmParams("")).toBe(false);
    expect(hasUtmParams("?categoria=abc&ordem=preco_asc")).toBe(false);
  });
});

describe("captureUtmParams / getStoredUtmParams", () => {
  it("guarda só as chaves utm_* presentes na URL de chegada", () => {
    captureUtmParams("?utm_source=instagram&utm_medium=social&categoria=abc");
    expect(getStoredUtmParams()).toEqual({ utm_source: "instagram", utm_medium: "social" });
  });

  it("sem utm_* na URL, não guarda nada", () => {
    captureUtmParams("?categoria=abc");
    expect(getStoredUtmParams()).toBeNull();
  });

  it("sem nenhuma captura prévia, devolve null (nunca lança)", () => {
    expect(getStoredUtmParams()).toBeNull();
  });
});

describe("withUtmFallback", () => {
  it("URL atual já com utm_*: devolve a própria URL, sem tocar na guardada", () => {
    captureUtmParams("?utm_source=instagram");
    expect(withUtmFallback("?utm_source=whatsapp")).toBe("?utm_source=whatsapp");
  });

  it("URL atual sem utm_* e com campanha guardada: completa com a guardada", () => {
    captureUtmParams("?utm_source=instagram&utm_medium=social");
    const result = withUtmFallback("?categoria=pedras-brutas");
    const params = new URLSearchParams(result);
    expect(params.get("categoria")).toBe("pedras-brutas");
    expect(params.get("utm_source")).toBe("instagram");
    expect(params.get("utm_medium")).toBe("social");
  });

  it("sem utm_* na URL atual e nada guardado: devolve a URL original sem alteração", () => {
    expect(withUtmFallback("?categoria=pedras-brutas")).toBe("?categoria=pedras-brutas");
    expect(withUtmFallback("")).toBe("");
  });
});
