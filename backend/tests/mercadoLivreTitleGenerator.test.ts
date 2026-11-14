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
    categoryName: "Pedras Brutas",
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
    const [row] = generateTitleSuggestions([baseProduct({ name: "Peça Decorativa Especial", categoryName: null })]);
    expect(row.titleA).not.toContain("Natural");
  });

  it("inclui o tamanho em cm quando couber", () => {
    const [row] = generateTitleSuggestions([baseProduct({ sizeCm: 23 })]);
    expect(row.titleA).toContain("23cm");
  });

  it("variação B usa a categoria quando disponível; sem categoria, usa o peso", () => {
    const withCategory = generateTitleSuggestions([baseProduct({ categoryName: "Pedras Brutas" })])[0];
    expect(withCategory.titleB).toContain("Pedras Brutas");

    const withoutCategory = generateTitleSuggestions([baseProduct({ categoryName: null, weightGrams: 850 })])[0];
    expect(withoutCategory.titleB).toContain("850 g");
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
      baseProduct({ name: longName, categoryName: null, sizeCm: 23, weightGrams: 850 }),
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
    const [row] = generateTitleSuggestions([baseProduct({ name, categoryName: null, sizeCm: 23, weightGrams: 850 })]);
    expect(row.titleA).not.toBeNull();
    expect(row.titleB).toBeNull();
    expect(row.warnings.map((w) => w.code)).toContain("variants_equal");
  });

  describe("sem duplicados entre peças", () => {
    it("mesmo nome, tamanho diferente: os títulos A já saem diferentes (tamanho inclui a diferenciação)", () => {
      const rows = generateTitleSuggestions([
        baseProduct({ id: "p1", sku: "A-1", name: "Drusa de Ametista", sizeCm: 20, categoryName: null }),
        baseProduct({ id: "p2", sku: "A-2", name: "Drusa de Ametista", sizeCm: 35, categoryName: null }),
      ]);
      expect(rows[0].titleA).not.toBe(rows[1].titleA);
      expect(rows[0].warnings.map((w) => w.code)).not.toContain("duplicate_title_a");
      expect(rows[1].warnings.map((w) => w.code)).not.toContain("duplicate_title_a");
    });

    it("mesmo nome e tamanho, peso diferente: diferencia acrescentando o peso ao título colidente", () => {
      const rows = generateTitleSuggestions([
        baseProduct({ id: "p1", sku: "B-1", name: "Drusa de Ametista", sizeCm: 20, weightGrams: 500, categoryName: null }),
        baseProduct({ id: "p2", sku: "B-2", name: "Drusa de Ametista", sizeCm: 20, weightGrams: 900, categoryName: null }),
      ]);
      expect(rows[0].titleA).not.toBe(rows[1].titleA);
      expect(rows[0].warnings.map((w) => w.code)).not.toContain("duplicate_title_a");
      expect(rows[1].warnings.map((w) => w.code)).not.toContain("duplicate_title_a");
    });

    it("mesmo nome, tamanho E peso: falha com aviso em vez de emitir título duplicado silenciosamente", () => {
      const rows = generateTitleSuggestions([
        baseProduct({ id: "p1", sku: "C-1", name: "Drusa de Ametista", sizeCm: 20, weightGrams: 500, categoryName: null }),
        baseProduct({ id: "p2", sku: "C-2", name: "Drusa de Ametista", sizeCm: 20, weightGrams: 500, categoryName: null }),
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
