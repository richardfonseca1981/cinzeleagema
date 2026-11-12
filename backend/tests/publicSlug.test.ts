import { describe, expect, it } from "vitest";
import {
  buildPublicSlug,
  extractIdSuffix,
  idSuffix,
  pickProductBySuffixMatch,
  SLUG_SUFFIX_LENGTH,
} from "../src/lib/publicSlug";

describe("idSuffix", () => {
  it("usa os últimos 6 caracteres do id, em minúsculas", () => {
    expect(idSuffix("cm3x9f8s9f0000t3rggiA1B2C3")).toBe("a1b2c3");
  });

  it("aceita um tamanho de sufixo diferente do default", () => {
    expect(idSuffix("abcdef", 3)).toBe("def");
    expect(SLUG_SUFFIX_LENGTH).toBe(6);
  });
});

describe("buildPublicSlug", () => {
  it("combina o slug do nome atual com o sufixo do id", () => {
    expect(buildPublicSlug("Ametista Bruta", "cm3x9f8s9f0000t3rggia1b2c3")).toBe("ametista-bruta-a1b2c3");
  });

  it("muda imediatamente se o nome mudar — o slug nunca é lido do banco", () => {
    const id = "cm3x9f8s9f0000t3rggia1b2c3";
    expect(buildPublicSlug("Ametista Bruta", id)).toBe("ametista-bruta-a1b2c3");
    expect(buildPublicSlug("Ametista Importada", id)).toBe("ametista-importada-a1b2c3");
  });

  it("usa 'peca' como base quando não há nome", () => {
    expect(buildPublicSlug(null, "cm3x9f8s9f0000t3rggia1b2c3")).toBe("peca-a1b2c3");
    expect(buildPublicSlug("   ", "cm3x9f8s9f0000t3rggia1b2c3")).toBe("peca-a1b2c3");
  });

  it("remove acentos e normaliza símbolos, igual ao slugify do cadastro", () => {
    expect(buildPublicSlug("Água-Marinha Única", "cm3x9f8s9f0000t3rggia1b2c3")).toBe("agua-marinha-unica-a1b2c3");
  });
});

describe("extractIdSuffix", () => {
  it("extrai o sufixo de um slug novo (nome + sufixo)", () => {
    expect(extractIdSuffix("ametista-bruta-a1b2c3")).toBe("a1b2c3");
  });

  it("extrai o MESMO sufixo de uma URL antiga (cuid puro) da mesma peça", () => {
    const id = "cm3x9f8s9f0000t3rggia1b2c3";
    expect(extractIdSuffix(id)).toBe(idSuffix(id));
    expect(extractIdSuffix(id)).toBe("a1b2c3");
  });

  it("normaliza para minúsculas", () => {
    expect(extractIdSuffix("ametista-bruta-A1B2C3")).toBe("a1b2c3");
  });
});

describe("pickProductBySuffixMatch", () => {
  it("sem candidato nenhum, devolve null", () => {
    expect(pickProductBySuffixMatch([], "ametista-bruta-a1b2c3")).toBeNull();
  });

  it("um único candidato: devolve ele, mesmo que o slug pedido esteja desatualizado", () => {
    const candidate = { id: "cm3x9f8s9f0000t3rggia1b2c3", name: "Ametista Importada" };
    expect(pickProductBySuffixMatch([candidate], "ametista-bruta-a1b2c3")).toBe(candidate);
  });

  it("colisão de sufixo: prefere o candidato cujo slug atual bate exatamente com o pedido", () => {
    const requested = "topazio-imperial-a1b2c3";
    const other = { id: "cm0000000000000000000a1b2c3", name: "Outra Peça Qualquer" };
    const match = { id: "cm1111111111111111111a1b2c3", name: "Topázio Imperial" };
    expect(pickProductBySuffixMatch([other, match], requested)).toBe(match);
    expect(pickProductBySuffixMatch([match, other], requested)).toBe(match);
  });

  it("colisão sem nenhuma correspondência exata: cai para o primeiro por id (determinístico)", () => {
    const a = { id: "cm-aaa-a1b2c3", name: "Peça A" };
    const b = { id: "cm-bbb-a1b2c3", name: "Peça B" };
    expect(pickProductBySuffixMatch([b, a], "slug-que-nao-bate-a1b2c3")).toBe(a);
    expect(pickProductBySuffixMatch([a, b], "slug-que-nao-bate-a1b2c3")).toBe(a);
  });
});
