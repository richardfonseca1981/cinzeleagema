import { describe, expect, it } from "vitest";
import { isGenericLegalNotice, isPlaceholderTitle, resolveBodyText, resolveTitle, type CatalogProductContent } from "../src/lib/catalog/content";

function product(overrides: Partial<CatalogProductContent> = {}): CatalogProductContent {
  return {
    name: null,
    nameEn: null,
    sku: null,
    description: null,
    descriptionEn: null,
    identificationPt: null,
    identificationEn: null,
    ...overrides,
  };
}

describe("resolveTitle", () => {
  it("usa identificationPt em PT quando existe", () => {
    expect(resolveTitle(product({ identificationPt: "Ágata Azul (Tingida)", name: "Pedra 1" }), "pt")).toBe("Ágata Azul (Tingida)");
  });

  it("usa identificationEn em EN quando existe", () => {
    expect(resolveTitle(product({ identificationPt: "Ágata Azul", identificationEn: "Blue Agate", name: "Pedra 1" }), "en")).toBe(
      "Blue Agate"
    );
  });

  it("EN cai para identificationPt se não houver identificationEn", () => {
    expect(resolveTitle(product({ identificationPt: "Ágata Azul" }), "en")).toBe("Ágata Azul");
  });

  it("sem identificação, usa name em PT", () => {
    expect(resolveTitle(product({ name: "Esmeralda Colombiana" }), "pt")).toBe("Esmeralda Colombiana");
  });

  it("sem identificação, usa nameEn em EN quando existe", () => {
    expect(resolveTitle(product({ name: "Esmeralda Colombiana", nameEn: "Colombian Emerald" }), "en")).toBe("Colombian Emerald");
  });

  it("EN sem nameEn cai para name em PT", () => {
    expect(resolveTitle(product({ name: "Esmeralda Colombiana" }), "en")).toBe("Esmeralda Colombiana");
  });

  it("sem identificação nem nome, usa o SKU", () => {
    expect(resolveTitle(product({ sku: "ESM-001" }), "pt")).toBe("ESM-001");
  });

  it("sem nada, usa o texto fixo no idioma certo", () => {
    expect(resolveTitle(product(), "pt")).toBe("Peça sem nome");
    expect(resolveTitle(product(), "en")).toBe("Unnamed piece");
  });
});

describe("resolveBodyText", () => {
  it("com identificação, usa ela (source: identification) em vez da description", () => {
    const result = resolveBodyText(
      product({ identificationPt: "Ágata Azul (Tingida)", description: "Aviso legal genérico aqui." }),
      "pt"
    );
    expect(result).toEqual({ text: "Ágata Azul (Tingida)", source: "identification" });
  });

  it("identificação em EN quando existe", () => {
    const result = resolveBodyText(product({ identificationPt: "Ágata Azul", identificationEn: "Blue Agate" }), "en");
    expect(result).toEqual({ text: "Blue Agate", source: "identification" });
  });

  it("sem identificação, PT usa description (source: description)", () => {
    const result = resolveBodyText(product({ description: "Peça lapidada à mão." }), "pt");
    expect(result).toEqual({ text: "Peça lapidada à mão.", source: "description" });
  });

  it("sem identificação, EN usa descriptionEn quando existe", () => {
    const result = resolveBodyText(product({ description: "Peça lapidada.", descriptionEn: "Hand-cut piece." }), "en");
    expect(result).toEqual({ text: "Hand-cut piece.", source: "description" });
  });

  it("sem identificação, EN sem descriptionEn cai para description (PT)", () => {
    const result = resolveBodyText(product({ description: "Peça lapidada à mão." }), "en");
    expect(result).toEqual({ text: "Peça lapidada à mão.", source: "description" });
  });

  it("sem identificação nem descrição, devolve null", () => {
    expect(resolveBodyText(product(), "pt")).toBeNull();
    expect(resolveBodyText(product(), "en")).toBeNull();
  });

  it("descrição em branco é tratada como ausente", () => {
    expect(resolveBodyText(product({ description: "   " }), "pt")).toBeNull();
  });

  it("description com o aviso legal genérico (PT) não é mostrada na página da peça", () => {
    const result = resolveBodyText(
      product({
        description:
          "Por se tratar de um produto natural, cada pedra é única e pode apresentar variações de tamanho, peso, formato, tonalidade, textura e características minerais.",
      }),
      "pt"
    );
    expect(result).toBeNull();
  });

  it("descriptionEn com o aviso legal genérico (EN) não é mostrada na página da peça", () => {
    const result = resolveBodyText(
      product({ descriptionEn: "As a natural product, each stone is unique and may present variations in size, weight." }),
      "en"
    );
    expect(result).toBeNull();
  });

  it("description própria (não genérica) continua sendo mostrada normalmente", () => {
    const result = resolveBodyText(product({ description: "Quartzo verde com inclusões douradas, lapidação artesanal." }), "pt");
    expect(result).toEqual({ text: "Quartzo verde com inclusões douradas, lapidação artesanal.", source: "description" });
  });
});

describe("isGenericLegalNotice", () => {
  it("reconhece o aviso legal genérico em PT", () => {
    expect(isGenericLegalNotice("Por se tratar de um produto natural, cada pedra é única...")).toBe(true);
  });

  it("reconhece o aviso legal genérico em EN", () => {
    expect(isGenericLegalNotice("As a natural product, each stone is unique...")).toBe(true);
  });

  it("ignora maiúsculas/acentos/espaçamento na comparação", () => {
    expect(isGenericLegalNotice("POR SE TRATAR DE UM PRODUTO NATURAL, cada pedra...")).toBe(true);
    expect(isGenericLegalNotice("  por se tratar   de um produto natural...")).toBe(true);
  });

  it("descrição própria (não começa com o aviso) não é reconhecida", () => {
    expect(isGenericLegalNotice("Quartzo verde com inclusões douradas.")).toBe(false);
  });
});

describe("isPlaceholderTitle", () => {
  it("detecta o padrão PT de importação em lote", () => {
    expect(isPlaceholderTitle("Pedra 4875 - Peso")).toBe(true);
    expect(isPlaceholderTitle("pedra 1 - peso")).toBe(true);
  });

  it("detecta o padrão EN de importação em lote", () => {
    expect(isPlaceholderTitle("Stone 4875 - Weight")).toBe(true);
  });

  it("nome de verdade não é marcado como placeholder", () => {
    expect(isPlaceholderTitle("Esmeralda Colombiana 2.3ct")).toBe(false);
    expect(isPlaceholderTitle("Pedra Verde Rolada")).toBe(false);
  });

  it("SKU ou texto fixo de peça sem nome não são marcados como placeholder", () => {
    expect(isPlaceholderTitle("ESM-001")).toBe(false);
    expect(isPlaceholderTitle("Peça sem nome")).toBe(false);
    expect(isPlaceholderTitle("Unnamed piece")).toBe(false);
  });
});
