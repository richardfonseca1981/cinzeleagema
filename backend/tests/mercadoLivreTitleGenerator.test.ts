import { describe, expect, it } from "vitest";
import {
  generateTitleSuggestions,
  sanitizeTitleText,
  type TitleGenerationInput,
} from "../src/lib/mercadoLivre/titleGenerator";
import { ML_TITLE_MAX_CHARS } from "../src/lib/mercadoLivre/listingValidator";

function baseProduct(overrides: Partial<TitleGenerationInput> = {}): TitleGenerationInput {
  return {
    id: "prod-1",
    name: "Ametista Uruguaia",
    nameEn: null,
    sku: "AME-001",
    description: null,
    descriptionEn: null,
    identificationPt: null,
    identificationEn: null,
    price: 1200,
    active: true,
    trackStock: false,
    stockQty: null,
    weightGrams: 850,
    sizeCm: 23,
    images: [{ width: 1080, height: 1920 }],
    ...overrides,
  };
}

describe("sanitizeTitleText", () => {
  it("remove aspas retas e curvas", () => {
    expect(sanitizeTitleText('Ametista "Especial" Rara')).not.toContain('"');
    expect(sanitizeTitleText("Ametista “Especial” Rara")).not.toMatch(/[“”]/);
    expect(sanitizeTitleText("Pedra 'Única'")).not.toContain("'");
  });

  it("remove ponto final (mas não pontos no meio do texto)", () => {
    expect(sanitizeTitleText("Ametista Uruguaia.")).toBe("Ametista Uruguaia");
    expect(sanitizeTitleText("Ametista Uruguaia...")).toBe("Ametista Uruguaia");
  });

  it('colapsa parênteses duplicados: "(38x20x14 cm))" vira "(38x20x14 cm)"', () => {
    expect(sanitizeTitleText("Geodo Grande (38x20x14 cm))")).toBe("Geodo Grande (38x20x14 cm)");
    expect(sanitizeTitleText("((Base Inclusa) Geodo")).toBe("(Base Inclusa) Geodo");
  });

  it("colapsa espaços duplos", () => {
    expect(sanitizeTitleText("Ametista    Uruguaia  Grande")).toBe("Ametista Uruguaia Grande");
  });

  it("sem caixa alta: nome todo em maiúsculas vira Title Case", () => {
    expect(sanitizeTitleText("AMETISTA URUGUAIA GRANDE")).toBe("Ametista Uruguaia Grande");
  });

  it("não mexe em nome que já está em mixed case normal", () => {
    expect(sanitizeTitleText("Ametista Uruguaia")).toBe("Ametista Uruguaia");
  });

  it("remove termos promocionais/de preço e o nome da loja", () => {
    expect(sanitizeTitleText("Ametista Barata Oferta Frete Grátis")).toBe("Ametista");
    expect(sanitizeTitleText("Ametista Uruguaia Cinzel e a Gema")).toBe("Ametista Uruguaia");
  });
});

describe("generateTitleSuggestions", () => {
  it("gera duas variações dentro do limite de 60 caracteres", () => {
    const [row] = generateTitleSuggestions([baseProduct()]);
    expect(row.titleA).not.toBeNull();
    expect(row.titleB).not.toBeNull();
    expect((row.titleA as string).length).toBeLessThanOrEqual(ML_TITLE_MAX_CHARS);
    expect((row.titleB as string).length).toBeLessThanOrEqual(ML_TITLE_MAX_CHARS);
    expect(row.titleALength).toBe((row.titleA as string).length);
    expect(row.titleBLength).toBe((row.titleB as string).length);
  });

  it("inclui 'Natural' quando reconhece um material conhecido no nome", () => {
    const [row] = generateTitleSuggestions([baseProduct({ name: "Ametista Uruguaia" })]);
    expect(row.titleA).toContain("Natural");
  });

  it("não inventa 'Natural' quando não reconhece nenhum material no nome", () => {
    const [row] = generateTitleSuggestions([baseProduct({ name: "Peça Decorativa Especial" })]);
    expect(row.titleA).not.toContain("Natural");
  });

  it("inclui o tamanho em cm quando couber", () => {
    const [row] = generateTitleSuggestions([baseProduct({ sizeCm: 23 })]);
    expect(row.titleA).toContain("23cm");
  });

  // Categoria interna (ex.: "Pedras Brutas", "Formas", "Homedecor") nem
  // existe mais no tipo de entrada (TitleGenerationInput = ListingValidationInput,
  // sem campo de categoria) — a garantia de "nunca usa categoria" agora é
  // estrutural (o compilador nem deixaria passar), não só um teste.
  it("variação B usa 'Pedra Natural' como termo de busca quando há material reconhecido", () => {
    const [row] = generateTitleSuggestions([baseProduct({ name: "Ametista Uruguaia" })]);
    expect(row.titleB).toContain("Pedra Natural");
  });

  it("variação B usa 'Peça Única' quando não há material reconhecido", () => {
    const [row] = generateTitleSuggestions([baseProduct({ name: "Peça Decorativa Especial" })]);
    expect(row.titleB).toContain("Peça Única");
  });

  it("peça inapta (ex.: sem preço) não gera nenhum título, com aviso 'ineligible'", () => {
    const [row] = generateTitleSuggestions([baseProduct({ price: null })]);
    expect(row.titleA).toBeNull();
    expect(row.titleB).toBeNull();
    expect(row.warnings.map((w) => w.code)).toContain("ineligible");
  });

  it("peça com nome provisório (import em lote) é inapta por construção — mesmo aviso 'ineligible', nenhum título", () => {
    const [row] = generateTitleSuggestions([baseProduct({ name: "Pedra 1234 - Peso" })]);
    expect(row.titleA).toBeNull();
    expect(row.titleB).toBeNull();
    expect(row.warnings.map((w) => w.code)).toContain("ineligible");
  });

  it("nunca corta uma palavra no meio ao truncar — trunca no último espaço que cabe", () => {
    // weightGrams/sizeCm positivos (eligibilidade exige > 0 nos dois) — o
    // nome sozinho já passa de 60 chars, então mesmo removendo tamanho (e
    // sem material/categoria pra remover) ainda sobra truncamento duro.
    const longName =
      "Pedra Extraordinaria Totalmente Desconhecida Sem Nenhuma Informacao Adicional Disponivel No Momento";
    const [row] = generateTitleSuggestions([
      baseProduct({ name: longName, sizeCm: 23, weightGrams: 850 }),
    ]);

    expect(row.titleA).not.toBeNull();
    const titleA = row.titleA as string;
    expect(titleA.length).toBeLessThanOrEqual(ML_TITLE_MAX_CHARS);
    // O resultado é um prefixo exato do nome original (nenhuma palavra foi
    // alterada/cortada) — e, se não é o nome inteiro, o próximo caractere no
    // nome original é um espaço (cortou ENTRE palavras, nunca no meio).
    expect(longName.startsWith(titleA)).toBe(true);
    if (titleA.length < longName.length) {
      expect(longName[titleA.length]).toBe(" ");
    }
    expect(row.warnings.map((w) => w.code)).toContain("title_a_hard_truncated");
  });

  it("falha com aviso (sem gerar B) quando não há nada para diferenciar a variação B da A", () => {
    // Nome sem material reconhecido e sem categoria: B tentaria diferenciar
    // com o peso, mas "nome + tamanho + peso" passa de 60 — o peso é
    // removido (prioridade mais baixa) e B colapsa pro mesmo texto de A.
    const name = "Peca Decorativa Artesanal Sem Material Reconhecido";
    const [row] = generateTitleSuggestions([baseProduct({ name, sizeCm: 23, weightGrams: 850 })]);
    expect(row.titleA).not.toBeNull();
    expect(row.titleB).toBeNull();
    expect(row.warnings.map((w) => w.code)).toContain("variants_equal");
  });

  describe("'Natural' nunca duplicado quando o nome já diz isso (SKUs reais: 117, 118, 120, 133, 134, 138, 160)", () => {
    it("nome já contém 'natural': título A não repete a palavra", () => {
      const [row] = generateTitleSuggestions([baseProduct({ name: "Drusa Natural de Ametista" })]);
      const occurrences = (row.titleA!.match(/natural/gi) ?? []).length;
      expect(occurrences).toBe(1);
    });

    it("detecta a palavra em qualquer posição, maiúscula/minúscula e com acento", () => {
      for (const name of ["Ametista NATURAL Uruguaia", "Ametista Uruguaia Natural", "natural Ametista Uruguaia"]) {
        const [row] = generateTitleSuggestions([baseProduct({ name })]);
        const occurrences = (row.titleA!.match(/natural/gi) ?? []).length;
        expect(occurrences).toBe(1);
      }
    });

    it("variação B cai para 'Peça Única' quando o nome já diz 'natural' (não usa 'Pedra Natural' duplicando a palavra)", () => {
      const [row] = generateTitleSuggestions([baseProduct({ name: "Drusa Natural de Ametista" })]);
      expect(row.titleB).toContain("Peça Única");
      expect(row.titleB).not.toContain("Pedra Natural");
    });

    it("nome com material desconhecido continua sem 'Natural' nenhum (comportamento normal, não é o caso de duplicação)", () => {
      const [row] = generateTitleSuggestions([baseProduct({ name: "Peça Decorativa Especial" })]);
      expect(row.titleA).not.toContain("Natural");
    });
  });

  describe("truncamento: sem conectivo no fim, prefere remover dimensões/partes opcionais, sem somar tamanho redundante (SKUs reais: C18, C17, C10, C12, C08, 111, 163)", () => {
    it("nunca termina em conectivo isolado (e, de, do, da, com, em, na, no, a, o, para) mesmo truncando duro", () => {
      const CONNECTIVES = new Set(["e", "de", "do", "da", "com", "em", "na", "no", "a", "o", "para"]);
      const names = [
        "Conjunto Grande de Pedras Raras e Lindas Vindas Direto Para Voce Agora",
        "Geodo Extraordinario de Ametista Muito Grande e Bonito Com Base Polida",
      ];
      for (const name of names) {
        const [row] = generateTitleSuggestions([baseProduct({ name, sizeCm: 23, weightGrams: 850 })]);
        expect(row.titleA).not.toBeNull();
        const lastWord = (row.titleA as string).split(" ").pop()!.toLowerCase();
        expect(CONNECTIVES.has(lastWord)).toBe(false);
        expect(row.warnings.map((w) => w.code)).toContain("title_a_hard_truncated");
      }
    });

    it("prefere remover o trecho '(NxNxN cm)' a truncar palavras do núcleo do nome", () => {
      // Núcleo sozinho (sem as dimensões) cabe tranquilo em 60 chars — só
      // ultrapassa com "(38x20x14 cm)" somado; a prioridade de remoção deve
      // derrubar as dimensões ANTES de cortar qualquer palavra do nome.
      const name = "Geodo Grande de Ametista Uruguaia Extraordinaria (38x20x14 cm)";
      const [row] = generateTitleSuggestions([baseProduct({ name, sizeCm: 23, weightGrams: 850 })]);

      expect(row.titleA).not.toBeNull();
      expect(row.titleA).not.toContain("(38x20x14 cm)");
      expect(row.titleA).toContain("Geodo Grande de Ametista Uruguaia Extraordinaria");
      expect(row.warnings.map((w) => w.code)).not.toContain("title_a_hard_truncated");
    });

    it("quando o nome já tem dimensões '(NxNxN cm)', não soma o 'Ncm' extra do campo sizeCm", () => {
      const [row] = generateTitleSuggestions([
        baseProduct({ name: "Geodo Grande (38x20x14 cm)", sizeCm: 23, weightGrams: 850 }),
      ]);
      expect(row.titleA).toContain("(38x20x14 cm)");
      expect(row.titleA).not.toContain("23cm");
    });

    it("sem dimensões embutidas, continua somando o tamanho normalmente", () => {
      const [row] = generateTitleSuggestions([baseProduct({ name: "Geodo Grande", sizeCm: 23 })]);
      expect(row.titleA).toContain("23cm");
    });
  });

  describe("diferenciação por peso entre peças de mesmo nome (SKUs reais: 131x129, C15xC16, tamanhos a até 1cm: 17x18, 15x24, 87x90, 84x89)", () => {
    it("tamanho igual, peso diferente: diferencia no formato compacto '1kg'/'540g' (caso 131 x 129)", () => {
      const rows = generateTitleSuggestions([
        baseProduct({ id: "p131", sku: "131", name: "Drusa de Ametista", sizeCm: 25, weightGrams: 1000 }),
        baseProduct({ id: "p129", sku: "129", name: "Drusa de Ametista", sizeCm: 25, weightGrams: 540 }),
      ]);
      expect(rows[0].titleA).toContain("1kg");
      expect(rows[1].titleA).toContain("540g");
      expect(rows[0].titleA).not.toBe(rows[1].titleA);
      expect(rows.flatMap((r) => r.warnings.map((w) => w.code))).not.toContain("duplicate_title_a");
    });

    it("peso grande em kg com casa decimal (caso C15 x C16, 8800g x 9900g)", () => {
      const rows = generateTitleSuggestions([
        baseProduct({ id: "pC15", sku: "C15", name: "Drusa de Ametista", sizeCm: 40, weightGrams: 8800 }),
        baseProduct({ id: "pC16", sku: "C16", name: "Drusa de Ametista", sizeCm: 40, weightGrams: 9900 }),
      ]);
      expect(rows[0].titleA).toContain("8,8kg");
      expect(rows[1].titleA).toContain("9,9kg");
    });

    it.each([
      [17, 18],
      [15, 24],
      [87, 90],
      [84, 89],
    ])("tamanhos a até 1cm de distância (%dcm x %dcm) de peças com MESMO nome: peso entra proativamente nas duas", (sizeA, sizeB) => {
      const diff = Math.abs(sizeA - sizeB);
      const rows = generateTitleSuggestions([
        baseProduct({ id: "pA", sku: "DIST-A", name: "Drusa de Ametista", sizeCm: sizeA, weightGrams: 1000 }),
        baseProduct({ id: "pB", sku: "DIST-B", name: "Drusa de Ametista", sizeCm: sizeB, weightGrams: 1500 }),
      ]);
      if (diff <= 1) {
        expect(rows[0].titleA).toContain("1kg");
        expect(rows[1].titleA).toContain("1,5kg");
      }
    });

    it("mesmo nome, tamanho E peso iguais: ainda colide — mantém o aviso e título vazio", () => {
      const rows = generateTitleSuggestions([
        baseProduct({ id: "pA", sku: "IGUAL-A", name: "Drusa de Ametista", sizeCm: 25, weightGrams: 1000 }),
        baseProduct({ id: "pB", sku: "IGUAL-B", name: "Drusa de Ametista", sizeCm: 25, weightGrams: 1000 }),
      ]);
      expect(rows[0].titleA).not.toBeNull();
      expect(rows[1].titleA).toBeNull();
      expect(rows[1].warnings.map((w) => w.code)).toContain("duplicate_title_a");
    });
  });

  describe("sem duplicados entre peças", () => {
    it("mesmo nome, tamanho diferente: os títulos A já saem diferentes (tamanho inclui a diferenciação)", () => {
      const rows = generateTitleSuggestions([
        baseProduct({ id: "p1", sku: "A-1", name: "Drusa de Ametista", sizeCm: 20 }),
        baseProduct({ id: "p2", sku: "A-2", name: "Drusa de Ametista", sizeCm: 35 }),
      ]);
      expect(rows[0].titleA).not.toBe(rows[1].titleA);
      expect(rows[0].warnings.map((w) => w.code)).not.toContain("duplicate_title_a");
      expect(rows[1].warnings.map((w) => w.code)).not.toContain("duplicate_title_a");
    });

    it("mesmo nome e tamanho, peso diferente: diferencia acrescentando o peso ao título colidente", () => {
      const rows = generateTitleSuggestions([
        baseProduct({ id: "p1", sku: "B-1", name: "Drusa de Ametista", sizeCm: 20, weightGrams: 500 }),
        baseProduct({ id: "p2", sku: "B-2", name: "Drusa de Ametista", sizeCm: 20, weightGrams: 900 }),
      ]);
      expect(rows[0].titleA).not.toBe(rows[1].titleA);
      expect(rows[0].warnings.map((w) => w.code)).not.toContain("duplicate_title_a");
      expect(rows[1].warnings.map((w) => w.code)).not.toContain("duplicate_title_a");
    });

    it("mesmo nome, tamanho E peso: falha com aviso em vez de emitir título duplicado silenciosamente", () => {
      const rows = generateTitleSuggestions([
        baseProduct({ id: "p1", sku: "C-1", name: "Drusa de Ametista", sizeCm: 20, weightGrams: 500 }),
        baseProduct({ id: "p2", sku: "C-2", name: "Drusa de Ametista", sizeCm: 20, weightGrams: 500 }),
      ]);

      // Nunca duas peças DIFERENTES com o mesmo título A não-nulo.
      const titlesA = rows.map((r) => r.titleA).filter((t): t is string => t !== null);
      expect(new Set(titlesA.map((t) => t.toLowerCase())).size).toBe(titlesA.length);

      const flagged = rows.filter((r) => r.warnings.some((w) => w.code === "duplicate_title_a"));
      expect(flagged).toHaveLength(1);
      expect(flagged[0].titleA).toBeNull();
    });
  });
});
