import { describe, expect, it } from "vitest";
import { sanitizeMercadoLivreDescriptionText } from "../src/lib/mercadoLivre/descriptionSanitizer";

describe("sanitizeMercadoLivreDescriptionText — remove contato/links/loja", () => {
  it("remove URL http(s) completa", () => {
    expect(sanitizeMercadoLivreDescriptionText("Veja mais em https://concorrente.com.br/produto?x=1 por aqui")).toBe(
      "Veja mais em por aqui"
    );
  });

  it("remove URL começando com www sem protocolo", () => {
    expect(sanitizeMercadoLivreDescriptionText("Visite www.outraloja.com.br para detalhes")).toBe("Visite para detalhes");
  });

  it("remove domínio nu com TLD conhecido, sem www nem protocolo", () => {
    expect(sanitizeMercadoLivreDescriptionText("Compre em outraloja.com.br direto")).toBe("Compre em direto");
  });

  it("remove e-mail", () => {
    expect(sanitizeMercadoLivreDescriptionText("Dúvidas: contato@outraloja.com.br agora")).toBe("Dúvidas: agora");
  });

  it("remove @usuário de rede social", () => {
    expect(sanitizeMercadoLivreDescriptionText("Segue a gente @outraloja.oficial no Instagram")).toBe(
      "Segue a gente no Instagram"
    );
  });

  it("remove menção a WhatsApp com número — formato (DD) 9XXXX-XXXX", () => {
    expect(sanitizeMercadoLivreDescriptionText("Fale no WhatsApp (14) 99822-1804 agora")).toBe("Fale no agora");
  });

  it("remove menção a zap com número sem separador", () => {
    expect(sanitizeMercadoLivreDescriptionText("zap 14999821804 pra combinar")).toBe("pra combinar");
  });

  it("remove menção a telefone com número e DDI +55", () => {
    expect(sanitizeMercadoLivreDescriptionText("Telefone: +55 14 99822-1804 - te espero")).toBe("- te espero");
  });

  it("remove número de telefone com formato completo mesmo sem palavra-gatilho", () => {
    expect(sanitizeMercadoLivreDescriptionText("Peça linda, (14) 99822-1804 obrigado")).toBe("Peça linda, obrigado");
  });

  it("remove o nome da loja (variações)", () => {
    expect(sanitizeMercadoLivreDescriptionText("Peça exclusiva O Cinzel e a Gema")).toBe("Peça exclusiva");
    expect(sanitizeMercadoLivreDescriptionText("Vendido por Cinzel")).toBe("Vendido por");
  });

  it("preserva quebras de linha (texto puro, sem juntar linhas)", () => {
    const text = "Primeira linha com contato@outraloja.com\nSegunda linha normal";
    expect(sanitizeMercadoLivreDescriptionText(text)).toBe("Primeira linha com\nSegunda linha normal");
  });

  it("remove linha que sobrou vazia depois da limpeza", () => {
    const text = "Antes\nwww.outraloja.com.br\nDepois";
    expect(sanitizeMercadoLivreDescriptionText(text)).toBe("Antes\nDepois");
  });
});

describe("sanitizeMercadoLivreDescriptionText — nunca remove medida/peso/preço/SKU/lote", () => {
  it("preserva dimensão no formato LxAxP cm", () => {
    expect(sanitizeMercadoLivreDescriptionText("Medidas aproximadas: 45x18x20 cm")).toBe("Medidas aproximadas: 45x18x20 cm");
  });

  it("preserva peso com separador de milhar", () => {
    expect(sanitizeMercadoLivreDescriptionText("Peso aproximado: 1.696 g")).toBe("Peso aproximado: 1.696 g");
  });

  it("preserva preço em reais", () => {
    expect(sanitizeMercadoLivreDescriptionText("Valor de referência R$ 1.250,00")).toBe("Valor de referência R$ 1.250,00");
  });

  it("preserva SKU curto", () => {
    expect(sanitizeMercadoLivreDescriptionText("Código interno SKU: PED-4521")).toBe("Código interno SKU: PED-4521");
  });

  it("preserva número de lote", () => {
    expect(sanitizeMercadoLivreDescriptionText("Peça do lote 2024-0891")).toBe("Peça do lote 2024-0891");
  });

  it("preserva palavra-gatilho de contato quando NÃO há número de telefone ao lado", () => {
    expect(sanitizeMercadoLivreDescriptionText("Pedra ideal para um celular ou vitrine")).toBe(
      "Pedra ideal para um celular ou vitrine"
    );
  });

  it("não remove texto comum sem nenhum dado sensível", () => {
    const text = "Ametista natural de tom lilás intenso, lapidação bruta, brilho vítreo.";
    expect(sanitizeMercadoLivreDescriptionText(text)).toBe(text);
  });
});
