import { describe, expect, it } from "vitest";
import {
  dedupeRepeatedName,
  isGenericLegalNotice,
  isPlaceholderTitle,
  resolveBodyText,
  resolveTitle,
  type CatalogProductContent,
} from "../src/lib/catalog/content";
import { REAL_EN_NOTICE_VARIANTS, REAL_PT_NOTICE_VARIANTS } from "./fixtures/realNoticeVariants";

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

// REVISÃO FINAL item 2: título = SEMPRE o nome cadastrado (identificação
// por IA deixou de ser fonte de título — ela virou fonte do CORPO, ver
// describe("resolveBodyText") abaixo).
describe("resolveTitle", () => {
  it("usa name em PT mesmo quando há identificação (identificação não é mais fonte de título)", () => {
    expect(resolveTitle(product({ identificationPt: "Ágata Azul (Tingida)", name: "Pedra 1" }), "pt")).toBe("Pedra 1");
  });

  it("usa nameEn em EN quando existe", () => {
    expect(resolveTitle(product({ name: "Esmeralda Colombiana", nameEn: "Colombian Emerald" }), "en")).toBe("Colombian Emerald");
  });

  it("EN sem nameEn cai para name em PT", () => {
    expect(resolveTitle(product({ name: "Esmeralda Colombiana" }), "en")).toBe("Esmeralda Colombiana");
  });

  it("sem nome, usa o SKU", () => {
    expect(resolveTitle(product({ sku: "ESM-001" }), "pt")).toBe("ESM-001");
  });

  it("sem nome nem SKU, usa o texto fixo no idioma certo", () => {
    expect(resolveTitle(product(), "pt")).toBe("Peça sem nome");
    expect(resolveTitle(product(), "en")).toBe("Unnamed piece");
  });

  it("nome vindo duplicado no cadastro é limpo para uma única ocorrência — título sem repetição", () => {
    expect(resolveTitle(product({ name: "Ágata Azul Ágata Azul" }), "pt")).toBe("Ágata Azul");
    expect(resolveTitle(product({ name: "Esmeralda Colombiana - esmeralda colombiana" }), "pt")).toBe("Esmeralda Colombiana");
  });
});

// REVISÃO FINAL item 2: corpo = identificação por IA (confirmada pelo
// admin) -> description própria (se não for o aviso genérico) -> nada.
// Qualquer corpo que comece repetindo o nome (já o título) tem esse começo
// removido; se ficar vazio, cai para a próxima fonte (ou nada).
describe("resolveBodyText", () => {
  it("usa identificação (source: identification) quando existe e é diferente do nome", () => {
    const result = resolveBodyText(
      product({ name: "Pedra 1", identificationPt: "Ágata Azul (Tingida)", description: "Quartzo com inclusões douradas." }),
      "pt",
      "Pedra 1"
    );
    expect(result).toEqual({ text: "Ágata Azul (Tingida)", source: "identification" });
  });

  it("identificação em EN quando existe", () => {
    const result = resolveBodyText(product({ name: "Pedra 1", identificationPt: "Ágata Azul", identificationEn: "Blue Agate" }), "en", "Stone 1");
    expect(result).toEqual({ text: "Blue Agate", source: "identification" });
  });

  it("corpo começando com o nome: o começo é removido (anti-duplicação)", () => {
    const result = resolveBodyText(product({ identificationPt: "Ágata Azul - uma peça rara, lapidação artesanal." }), "pt", "Ágata Azul");
    expect(result).toEqual({ text: "uma peça rara, lapidação artesanal.", source: "identification" });
  });

  it("corpo começando com o nome ignora maiúsculas/acentos/pontuação", () => {
    const result = resolveBodyText(product({ identificationPt: "ágata azul: uma peça rara." }), "pt", "Ágata Azul");
    expect(result).toEqual({ text: "uma peça rara.", source: "identification" });
  });

  it("corpo só com o nome (identificação idêntica ao título): fica null, não mostra o nome de novo", () => {
    const result = resolveBodyText(product({ name: "Esfera de Ágata com Geodo", identificationPt: "Esfera de Ágata com Geodo" }), "pt", "Esfera de Ágata com Geodo");
    expect(result).toBeNull();
  });

  it("identificação só com o nome, mas HÁ description própria: cai para a description (não fica sem corpo)", () => {
    const result = resolveBodyText(
      product({ identificationPt: "Ágata Azul", description: "Geodo roxo intenso, lapidação natural." }),
      "pt",
      "Ágata Azul"
    );
    expect(result).toEqual({ text: "Geodo roxo intenso, lapidação natural.", source: "description" });
  });

  it("sem identificação, PT usa description (source: description)", () => {
    const result = resolveBodyText(product({ description: "Peça lapidada à mão." }), "pt", "Esmeralda Colombiana");
    expect(result).toEqual({ text: "Peça lapidada à mão.", source: "description" });
  });

  it("sem identificação, EN usa descriptionEn quando existe", () => {
    const result = resolveBodyText(product({ description: "Peça lapidada.", descriptionEn: "Hand-cut piece." }), "en", "Emerald");
    expect(result).toEqual({ text: "Hand-cut piece.", source: "description" });
  });

  it("sem identificação, EN sem descriptionEn cai para description (PT)", () => {
    const result = resolveBodyText(product({ description: "Peça lapidada à mão." }), "en", "Emerald");
    expect(result).toEqual({ text: "Peça lapidada à mão.", source: "description" });
  });

  it("sem identificação nem descrição, devolve null", () => {
    expect(resolveBodyText(product(), "pt", "Esmeralda Colombiana")).toBeNull();
    expect(resolveBodyText(product(), "en", "Emerald")).toBeNull();
  });

  it("descrição em branco é tratada como ausente", () => {
    expect(resolveBodyText(product({ description: "   " }), "pt", "Esmeralda Colombiana")).toBeNull();
  });

  it("description com o aviso legal genérico (PT) não é mostrada na página da peça", () => {
    const result = resolveBodyText(
      product({
        description:
          "Por se tratar de um produto natural, cada pedra é única e pode apresentar variações de tamanho, peso, formato, tonalidade, textura e características minerais.",
      }),
      "pt",
      "Esmeralda Colombiana"
    );
    expect(result).toBeNull();
  });

  it("descriptionEn com o aviso legal genérico (EN) não é mostrada na página da peça", () => {
    const result = resolveBodyText(
      product({ descriptionEn: "As a natural product, each stone is unique and may present variations in size, weight." }),
      "en",
      "Emerald"
    );
    expect(result).toBeNull();
  });

  it("description própria (não genérica) continua sendo mostrada normalmente", () => {
    const result = resolveBodyText(
      product({ description: "Quartzo verde com inclusões douradas, lapidação artesanal." }),
      "pt",
      "Esmeralda Colombiana"
    );
    expect(result).toEqual({ text: "Quartzo verde com inclusões douradas, lapidação artesanal.", source: "description" });
  });

  it("description que começa repetindo o título tem o prefixo removido", () => {
    const result = resolveBodyText(product({ description: "Ágata Azul - uma peça rara, lapidação artesanal." }), "pt", "Ágata Azul");
    expect(result).toEqual({ text: "uma peça rara, lapidação artesanal.", source: "description" });
  });

  it("description idêntica ao título (sem mais nada): fica null, não mostra o nome de novo", () => {
    const result = resolveBodyText(product({ description: "Ágata Azul" }), "pt", "Ágata Azul");
    expect(result).toBeNull();
  });

  it("corpo longo (várias frases) é mantido por completo — truncamento é responsabilidade de fitDescriptionText, não de resolveBodyText", () => {
    const longText =
      "Drusa profunda e cristais bem definidos, tonalidade violeta intensa em toda a extensão, base polida para exposição em superfície plana, peça única sem reparos ou restaurações visíveis.";
    const result = resolveBodyText(product({ description: longText }), "pt", "Geodo de Ametista Uruguaia");
    expect(result).toEqual({ text: longText, source: "description" });
  });
});

describe("dedupeRepeatedName", () => {
  it('colapsa "X X" para "X"', () => {
    expect(dedupeRepeatedName("Ágata Azul Ágata Azul")).toBe("Ágata Azul");
  });

  it('colapsa "X - X" para "X", ignorando acento/maiúscula', () => {
    expect(dedupeRepeatedName("Ágata Azul - ágata azul")).toBe("Ágata Azul");
  });

  it("não altera um nome sem repetição", () => {
    expect(dedupeRepeatedName("Esmeralda Colombiana 2.3ct")).toBe("Esmeralda Colombiana 2.3ct");
  });

  it("não colapsa palavras repetidas legítimas (não é a sequência inteira duplicada)", () => {
    expect(dedupeRepeatedName("Pedra Rosa Rosada")).toBe("Pedra Rosa Rosada");
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

  it("descrição própria curta (não é o aviso) não é reconhecida como genérica", () => {
    expect(isGenericLegalNotice("Quartzo verde com inclusões douradas.")).toBe(false);
    expect(isGenericLegalNotice("Deep purple amethyst with a faceted cut and vitreous luster.")).toBe(false);
  });

  it("descrição própria que menciona peso/tamanho não é reconhecida como genérica", () => {
    expect(
      isGenericLegalNotice(
        "Peça rara de turmalina verde, pesa cerca de 45 gramas e mede 6 centímetros de comprimento, extraída em Minas Gerais.",
      ),
    ).toBe(false);
    expect(
      isGenericLegalNotice(
        "Rare green tourmaline piece, weighs about 45 grams and measures 6 centimeters long, mined in Minas Gerais.",
      ),
    ).toBe(false);
  });

  // Cobertura com dados REAIS: a investigação nos 109 produtos do banco de
  // amostra (cinzel_catalogo_amostra) mostrou que `description` (PT) é
  // byte-idêntico em todas as 109 peças (1 variante), mas `descriptionEn`
  // tem 107 variantes DISTINTAS — cada peça foi traduzida independentemente
  // por IA, então nenhum prefixo fixo cobriria todas (ver content.ts,
  // comentário de GENERIC_NOTICE_KEYWORDS). As variantes abaixo (ver
  // tests/fixtures/realNoticeVariants.ts) são o texto real, verificado
  // diretamente contra o banco de amostra antes de serem fixadas aqui.
  it.each(REAL_PT_NOTICE_VARIANTS.map((text, i) => [i + 1, text] as const))(
    "reconhece a variante PT real #%i encontrada no banco de amostra",
    (_i, text) => {
      expect(isGenericLegalNotice(text)).toBe(true);
    },
  );

  it.each(REAL_EN_NOTICE_VARIANTS.map((text, i) => [i + 1, text] as const))(
    "reconhece a variante EN real #%i encontrada no banco de amostra",
    (_i, text) => {
      expect(isGenericLegalNotice(text)).toBe(true);
    },
  );
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
