import { describe, expect, it } from "vitest";
import { buildPublicProductSlug, idSuffix, slugify } from "./productSlug";

describe("slugify", () => {
  it("lowercases, remove acentos e troca espaços/símbolos por hífen", () => {
    expect(slugify("Esmeralda Colombiana 2.3ct")).toBe("esmeralda-colombiana-2-3ct");
    expect(slugify("Água-Marinha  Única")).toBe("agua-marinha-unica");
  });
});

describe("buildPublicProductSlug", () => {
  it("combina o slug do nome com o sufixo do id — mesmo algoritmo do backend", () => {
    expect(buildPublicProductSlug("Ametista Bruta", "cm3x9f8s9f0000t3rggia1b2c3")).toBe("ametista-bruta-a1b2c3");
  });

  it("usa 'peca' como base quando não há nome", () => {
    expect(buildPublicProductSlug(null, "cm3x9f8s9f0000t3rggia1b2c3")).toBe("peca-a1b2c3");
  });

  it("muda se o nome mudar, mesmo id", () => {
    const id = "cm3x9f8s9f0000t3rggia1b2c3";
    expect(buildPublicProductSlug("Ametista Bruta", id)).not.toBe(buildPublicProductSlug("Ametista Importada", id));
  });
});

describe("idSuffix", () => {
  it("usa os últimos 6 caracteres em minúsculas", () => {
    expect(idSuffix("cm3x9f8s9f0000t3rggiA1B2C3")).toBe("a1b2c3");
  });
});
