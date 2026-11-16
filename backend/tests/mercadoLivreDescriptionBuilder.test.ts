import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/lib/env";
import { buildMercadoLivreDescription, ML_CURATION_TEXT, type DescriptionBuilderInput } from "../src/lib/mercadoLivre/descriptionBuilder";

function baseProduct(overrides: Partial<DescriptionBuilderInput> = {}): DescriptionBuilderInput {
  return {
    name: "Ametista Uruguaia",
    nameEn: null,
    sku: "AME-001",
    description: "Peça lapidada à mão, brilho intenso e transparência alta.",
    descriptionEn: null,
    identificationPt: null,
    identificationEn: null,
    identificationTreatment: null,
    weightGrams: 450,
    sizeCm: 12.5,
    ...overrides,
  };
}

describe("buildMercadoLivreDescription", () => {
  it("começa sempre pelo texto de curadoria fixo", () => {
    const text = buildMercadoLivreDescription(baseProduct());
    expect(text.startsWith(ML_CURATION_TEXT)).toBe(true);
  });

  it("nunca afirma certificação ou laudo no texto de curadoria", () => {
    expect(ML_CURATION_TEXT.toLowerCase()).not.toContain("certificado");
    expect(ML_CURATION_TEXT.toLowerCase()).not.toContain("laudo");
  });

  it("inclui peso e tamanho formatados quando presentes", () => {
    const text = buildMercadoLivreDescription(baseProduct({ weightGrams: 450, sizeCm: 12.5 }));
    expect(text).toContain("Peso: 450 g");
    expect(text).toContain("Tamanho: 12,5 cm");
  });

  it("formata peso em kg quando >= 1000g", () => {
    const text = buildMercadoLivreDescription(baseProduct({ weightGrams: 1850 }));
    expect(text).toContain("Peso: 1,85 kg");
  });

  it("omite peso/tamanho quando ausentes (0)", () => {
    const text = buildMercadoLivreDescription(baseProduct({ weightGrams: 0, sizeCm: 0, description: null }));
    expect(text).not.toContain("Peso:");
    expect(text).not.toContain("Tamanho:");
  });

  it("inclui linha de material quando o nome indica mineral conhecido", () => {
    const text = buildMercadoLivreDescription(baseProduct({ name: "Ametista Uruguaia" }));
    expect(text).toContain("Material: pedra natural");
  });

  it("omite linha de material quando o nome não indica mineral conhecido", () => {
    const text = buildMercadoLivreDescription(baseProduct({ name: "Peça Decorativa Azul" }));
    expect(text).not.toContain("Material:");
  });

  it("inclui o corpo existente (resolveBodyText) quando houver", () => {
    const text = buildMercadoLivreDescription(baseProduct({ description: "Peça lapidada à mão, brilho intenso." }));
    expect(text).toContain("Peça lapidada à mão, brilho intenso.");
  });

  it("sanitiza o corpo antes de incluir (remove contato/URL/loja do texto vindo do banco)", () => {
    const text = buildMercadoLivreDescription(
      baseProduct({ description: "Peça exclusiva, fale no WhatsApp (14) 99822-1804 ou veja www.outraloja.com" })
    );
    expect(text).not.toContain("99822-1804");
    expect(text).not.toContain("outraloja.com");
    expect(text).toContain("Peça exclusiva");
  });

  it("acrescenta disclosure de tratamento quando a peça é tingida", () => {
    const text = buildMercadoLivreDescription(baseProduct({ identificationTreatment: "TINGIDA" }));
    expect(text).toContain("tingida artificialmente");
  });

  it("acrescenta disclosure de possível tingimento sem afirmar laudo", () => {
    const text = buildMercadoLivreDescription(baseProduct({ identificationTreatment: "POSSIVEL_TINGIMENTO" }));
    expect(text).toContain("possível tingimento");
    expect(text).not.toContain("laudo gemológico confirma");
  });

  it("não quebra quando não há corpo nem disclosure — mantém curadoria + specs", () => {
    const text = buildMercadoLivreDescription(baseProduct({ description: null, identificationPt: null }));
    expect(text.startsWith(ML_CURATION_TEXT)).toBe(true);
    expect(text).toContain("Peso:");
  });

  it("preserva quebras de linha como texto puro, sem markdown", () => {
    const text = buildMercadoLivreDescription(baseProduct({ description: "Linha um.\nLinha dois." }));
    expect(text).toContain("Linha um.\nLinha dois.");
    expect(text).not.toMatch(/[*_#`]/);
  });

  it("monta as partes na ordem: curadoria -> specs -> corpo -> disclosure", () => {
    const text = buildMercadoLivreDescription(baseProduct({ identificationTreatment: "TINGIDA" }));
    const curationIdx = text.indexOf(ML_CURATION_TEXT);
    const specsIdx = text.indexOf("Peso:");
    const bodyIdx = text.indexOf("Peça lapidada");
    const disclosureIdx = text.indexOf("tingida artificialmente");
    expect(curationIdx).toBeLessThan(specsIdx);
    expect(specsIdx).toBeLessThan(bodyIdx);
    expect(bodyIdx).toBeLessThan(disclosureIdx);
  });

  describe("limite de tamanho configurável", () => {
    const original = env.ML_DESCRIPTION_MAX_CHARS;

    afterEach(() => {
      env.ML_DESCRIPTION_MAX_CHARS = original;
    });

    it("trunca no limite configurado sem cortar palavra no meio", () => {
      env.ML_DESCRIPTION_MAX_CHARS = 120;
      const text = buildMercadoLivreDescription(
        baseProduct({ description: "Peça lapidada à mão, com brilho intenso e transparência bastante alta para o tipo." })
      );
      expect(text.length).toBeLessThanOrEqual(120);
      expect(text.endsWith("…")).toBe(true);
    });

    it("não trunca quando o texto final já cabe no limite", () => {
      env.ML_DESCRIPTION_MAX_CHARS = 5000;
      const text = buildMercadoLivreDescription(baseProduct());
      expect(text.endsWith("…")).toBe(false);
    });
  });
});
