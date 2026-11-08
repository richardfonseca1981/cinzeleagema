import { describe, expect, it } from "vitest";
import {
  dedupeRepeatedName,
  isGenericLegalNotice,
  isPlaceholderTitle,
  isTitleLikeIdentification,
  resolveBodyText,
  resolveTitle,
  type CatalogProductContent,
} from "../src/lib/catalog/content";
import { REAL_EN_NOTICE_VARIANTS, REAL_PT_NOTICE_VARIANTS } from "./fixtures/realNoticeVariants";
import { REAL_IDENTIFICATION_NAME_CASES, REAL_NAME_IDENTIFICATION_CLASS_D } from "./fixtures/realIdentificationNameCases";

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

  // Nome placeholder de importação em lote (ver isPlaceholderTitle) + identificação
  // title-like disponível: a peça ainda não tem nome de catálogo de verdade, então a
  // identificação (um nome sugerido) é um título melhor que "Pedra 4864 - Peso".
  it("nome placeholder + identificação title-like: título = identificação (PT e EN)", () => {
    expect(
      resolveTitle(product({ name: "Pedra 4864 - Peso", nameEn: "Stone 4864 - Weight", identificationPt: "Quartzo Rosa Bruto" }), "pt")
    ).toBe("Quartzo Rosa Bruto");
    expect(
      resolveTitle(
        product({ name: "Pedra 4864 - Peso", nameEn: "Stone 4864 - Weight", identificationEn: "Raw Rose Quartz" }),
        "en"
      )
    ).toBe("Raw Rose Quartz");
  });

  it("nome REAL (não placeholder) + identificação: título continua sendo o Nome, mesmo com identificação title-like", () => {
    expect(resolveTitle(product({ name: "Drusa de Ametista", identificationPt: "Geodo de Ametista" }), "pt")).toBe("Drusa de Ametista");
  });

  it("nome placeholder SEM identificação: título continua sendo o nome placeholder (warnings continua sinalizando, ver generateCatalogPdf.test.ts)", () => {
    expect(resolveTitle(product({ name: "Pedra 4875 - Peso" }), "pt")).toBe("Pedra 4875 - Peso");
  });

  it("nome placeholder + identificação que NÃO é title-like (descritiva/longa): título continua sendo o nome placeholder", () => {
    const longIdentification = "Peça extraída em Minas Gerais, com lapidação artesanal e brilho vítreo acentuado.";
    expect(resolveTitle(product({ name: "Pedra 4875 - Peso", identificationPt: longIdentification }), "pt")).toBe("Pedra 4875 - Peso");
  });
});

// REVISÃO FINAL item 2: corpo = identificação por IA (confirmada pelo
// admin) -> description própria (se não for o aviso genérico) -> nada.
// Qualquer corpo que comece repetindo o nome (já o título) tem esse começo
// removido; se ficar vazio, cai para a próxima fonte (ou nada).
describe("resolveBodyText", () => {
  it("identificação curta (title-like) NUNCA é usada como corpo, mesmo diferente do nome — cai para a description própria", () => {
    const result = resolveBodyText(
      product({ name: "Pedra 1", identificationPt: "Ágata Azul (Tingida)", description: "Quartzo com inclusões douradas." }),
      "pt",
      "Pedra 1"
    );
    expect(result).toEqual({ text: "Quartzo com inclusões douradas.", source: "description" });
  });

  it("identificação curta (title-like) em EN, sem description própria: fica sem corpo (não mostra o nome de novo)", () => {
    const result = resolveBodyText(product({ name: "Pedra 1", identificationPt: "Ágata Azul", identificationEn: "Blue Agate" }), "en", "Stone 1");
    expect(result).toBeNull();
  });

  it("identificação descritiva longa (com ponto final, não é title-like) continua virando corpo", () => {
    const longIdentification =
      "Peça extraída em Minas Gerais, com lapidação artesanal e brilho vítreo acentuado, raramente encontrada nessa tonalidade.";
    const result = resolveBodyText(product({ name: "Pedra 1", identificationPt: longIdentification }), "pt", "Pedra 1");
    expect(result).toEqual({ text: longIdentification, source: "identification" });
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

describe("isTitleLikeIdentification", () => {
  it("texto curto sem ponto nem quebra de linha é title-like", () => {
    expect(isTitleLikeIdentification("Cianita em Matriz")).toBe(true);
    expect(isTitleLikeIdentification("Ágata Azul (Tingida)")).toBe(true);
  });

  it("texto com ponto final não é title-like (frase completa)", () => {
    expect(isTitleLikeIdentification("Cianita em matriz, peça rara.")).toBe(false);
  });

  it("texto com quebra de linha não é title-like", () => {
    expect(isTitleLikeIdentification("Cianita em Matriz\nPeça rara")).toBe(false);
  });

  it("texto com mais de 10 palavras não é title-like, mesmo sem ponto", () => {
    expect(isTitleLikeIdentification("Uma peça de cianita azul em matriz com brilho intenso e lapidação natural rara")).toBe(false);
  });

  it("texto vazio não é title-like", () => {
    expect(isTitleLikeIdentification("   ")).toBe(false);
  });
});

// Regressão do bug relatado pelo Felipe: peça onde ele corrige o Nome
// depois de usar a IA como base, fazendo identificationPt/En divergir do
// Nome — sem essa correção, o catálogo mostrava o Nome no título e, de
// novo, a sugestão da IA (diferente) como corpo. Fixtures de
// tests/fixtures/realIdentificationNameCases.ts (9 peças reais da
// produção, classes a/b/c, + 1 classe "d" sintética — ver comentário no
// fixture). Nenhuma delas tem `description` própria nestes dados, então o
// resultado esperado é SEMPRE null: o Nome aparece uma única vez (no
// título), nunca repetido/divergente no corpo.
describe("resolveBodyText — anti-duplicação do nome (identificação vs. Nome editado pelo admin)", () => {
  it.each(REAL_IDENTIFICATION_NAME_CASES.map((c) => [c.ref, c.class, c] as const))(
    "ref=%s classe=%s: identificação title-like nunca aparece como corpo, independente da semelhança com o Nome",
    (_ref, _class, c) => {
      const resultPt = resolveBodyText(
        product({ name: c.name, nameEn: c.nameEn, identificationPt: c.identificationPt, identificationEn: c.identificationEn }),
        "pt",
        c.name
      );
      expect(resultPt).toBeNull();

      const resultEn = resolveBodyText(
        product({ name: c.name, nameEn: c.nameEn, identificationPt: c.identificationPt, identificationEn: c.identificationEn }),
        "en",
        c.nameEn
      );
      expect(resultEn).toBeNull();
    }
  );

  it("classe (d) sintética — identificação sem relação nenhuma com o Nome também não aparece como corpo", () => {
    const c = REAL_NAME_IDENTIFICATION_CLASS_D;
    const result = resolveBodyText(
      product({ name: c.name, nameEn: c.nameEn, identificationPt: c.identificationPt, identificationEn: c.identificationEn }),
      "pt",
      c.name
    );
    expect(result).toBeNull();
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
