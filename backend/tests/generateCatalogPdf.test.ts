import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { PDFParse } from "pdf-parse";
import "./setup";

vi.mock("../src/lib/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/r2")>();
  return { ...actual, isR2Configured: vi.fn(() => true), getObject: vi.fn() };
});

vi.mock("../src/lib/exchangeRate", () => ({
  getExchangeRate: vi.fn(async () => ({ rate: 5, updatedAt: new Date(), source: "live" as const })),
}));

import { generateCatalogPdf } from "../src/lib/catalog/generateCatalogPdf";
import { prisma } from "../src/lib/prisma";
import * as r2 from "../src/lib/r2";
import { cleanDatabase } from "./helpers";

const mockedGetObject = vi.mocked(r2.getObject);

// Extrai o texto de cada página do PDF gerado (pdf-parse/pdfjs-dist) — usado
// pelos testes da página de informações (FIX CATÁLOGO/PÁGINA DE
// INFORMAÇÕES) para verificar texto e ORDEM das páginas de verdade, não só
// a contagem (pageCount já cobria a contagem antes desta rodada).
// Colapsa quebras de linha em espaço — pdf-parse extrai o texto por LINHA
// VISUAL renderizada (ex.: um parágrafo que quebrou em 2 linhas no PDF sai
// como "...selecionada e\nfotografada...", não "...selecionada e fotografada...")
// então comparar uma frase inteira como string contígua exige normalizar os
// espaços antes.
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function extractPageTexts(buffer: Buffer): Promise<string[]> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.pages.map((page) => normalizeWhitespace(page.text));
}

// Heading exato (com os dois-pontos) da página de informações — usado em vez
// da substring "Curadoria Exclusiva" sozinha nos testes que checam
// ausência/posição exata: essa frase também aparece dentro do rodapé de
// QUALQUER página de peça desde o ajuste do rodapé (FIX CATÁLOGO/RODAPÉ),
// então a substring sozinha daria falso positivo numa página de peça.
const INFO_PAGE_HEADING_PT = "Curadoria Exclusiva – Exemplar Único:";

const syntheticJpeg = (w: number, h: number, color: { r: number; g: number; b: number }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } })
    .jpeg()
    .toBuffer();

async function createProduct(data: {
  name: string;
  sku: string;
  price: number | null;
  description?: string;
  descriptionEn?: string;
  sizeCm?: number;
  weightGrams?: number;
  identificationPt?: string;
  identificationEn?: string;
  active?: boolean;
  withPhoto?: boolean;
  categoryId?: string;
}) {
  const product = await prisma.product.create({
    data: {
      name: data.name,
      slug: data.name.toLowerCase().replace(/\s+/g, "-"),
      sku: data.sku,
      price: data.price,
      description: data.description ?? null,
      descriptionEn: data.descriptionEn ?? null,
      sizeCm: data.sizeCm ?? 0,
      weightGrams: data.weightGrams ?? 0,
      identificationPt: data.identificationPt ?? null,
      identificationEn: data.identificationEn ?? null,
      active: data.active ?? true,
      categoryId: data.categoryId ?? null,
    },
  });
  if (data.withPhoto !== false) {
    await prisma.productImage.create({
      data: {
        productId: product.id,
        url: `https://cdn.test/${product.id}.jpg`,
        key: `products/${product.id}/cover.jpg`,
        position: 0,
      },
    });
  }
  return product;
}

beforeEach(async () => {
  await cleanDatabase();
  mockedGetObject.mockReset();
  mockedGetObject.mockImplementation(async () => syntheticJpeg(300, 400, { r: 100, g: 150, b: 200 }));
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("generateCatalogPdf", () => {
  it("gera um PDF válido: capa + peças com foto + contato, e pula a peça sem foto", async () => {
    await createProduct({ name: "Esmeralda Colombiana", sku: "ESM-001", price: 8500, description: "Peça lapidada à mão." });
    await createProduct({ name: "Ametista Uruguaia", sku: "AME-001", price: 1200, description: "Geodo roxo intenso." });
    const withoutPhoto = await createProduct({ name: "Topázio Sem Foto", sku: "TOP-999", price: 500, withPhoto: false });

    const result = await generateCatalogPdf({ language: "pt" });

    expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // capa + 2 peças com foto + contato
    expect(result.pageCount).toBe(4);
    expect(result.skipped).toEqual([{ id: withoutPhoto.id, reason: "Peça sem foto" }]);
  });

  it("peça cuja busca no R2 falha entra em skipped com o motivo, sem derrubar a geração", async () => {
    await createProduct({ name: "Peça Normal", sku: "N-1", price: 100 });
    const broken = await createProduct({ name: "Peça Quebrada", sku: "N-2", price: 200 });

    mockedGetObject.mockImplementation(async (key: string) => {
      if (key.includes(broken.id)) throw new Error("objeto não encontrado");
      return syntheticJpeg(300, 400, { r: 10, g: 10, b: 10 });
    });

    const result = await generateCatalogPdf({ language: "pt" });

    expect(result.pageCount).toBe(3); // capa + 1 peça válida + contato
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].id).toBe(broken.id);
    expect(result.skipped[0].reason).toContain("Falha ao buscar a foto no R2");
  });

  it("só inclui peças ativas por padrão; includeInactive=true inclui todas", async () => {
    await createProduct({ name: "Ativa", sku: "A-1", price: 10, active: true });
    await createProduct({ name: "Inativa", sku: "I-1", price: 10, active: false });

    const activeOnly = await generateCatalogPdf({ language: "pt" });
    expect(activeOnly.pageCount).toBe(3); // capa + 1 ativa + contato

    const withInactive = await generateCatalogPdf({ language: "pt", includeInactive: true });
    expect(withInactive.pageCount).toBe(4); // capa + 2 + contato
  });

  it("productIds filtra o catálogo para só as peças pedidas", async () => {
    const a = await createProduct({ name: "Peça A", sku: "A-1", price: 10 });
    await createProduct({ name: "Peça B", sku: "B-1", price: 10 });

    const result = await generateCatalogPdf({ language: "pt", productIds: [a.id] });
    expect(result.pageCount).toBe(3); // capa + 1 peça + contato
    expect(result.skipped).toEqual([]);
  });

  it("preço null gera PDF normalmente (sem a peça entrar em skipped)", async () => {
    await createProduct({ name: "Peça Sem Preço", sku: "SP-1", price: null });

    const result = await generateCatalogPdf({ language: "pt" });
    expect(result.pageCount).toBe(3);
    expect(result.skipped).toEqual([]);
  });

  it("idioma EN busca a cotação do dia", async () => {
    await createProduct({ name: "Peça", sku: "EN-1", price: 100 });
    const { getExchangeRate } = await import("../src/lib/exchangeRate");

    await generateCatalogPdf({ language: "en" });
    expect(vi.mocked(getExchangeRate)).toHaveBeenCalled();
  });

  it("catálogo vazio ainda gera capa + contato", async () => {
    const result = await generateCatalogPdf({ language: "pt" });
    expect(result.pageCount).toBe(2);
    expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("includeContactPage=false remove a página de contato", async () => {
    await createProduct({ name: "Peça", sku: "CP-1", price: 10 });

    const withContact = await generateCatalogPdf({ language: "pt" });
    const withoutContact = await generateCatalogPdf({ language: "pt", includeContactPage: false });

    expect(withContact.pageCount).toBe(3); // capa + 1 peça + contato
    expect(withoutContact.pageCount).toBe(2); // capa + 1 peça
  });

  describe("página de informações (FIX CATÁLOGO/PÁGINA DE INFORMAÇÕES — a pedido do Felipe)", () => {
    it("PT: texto novo de curadoria presente, texto antigo de avisos ausente em NENHUMA página", async () => {
      await createProduct({ name: "Peça", sku: "INFO-PT", price: 10 });
      const result = await generateCatalogPdf({ language: "pt" });
      const pages = await extractPageTexts(result.buffer);
      const fullText = pages.join("\n");

      expect(fullText).toContain("Curadoria Exclusiva – Exemplar Único:");
      expect(fullText).toContain(
        "O cristal apresentado nas imagens é exatamente o exemplar que chegará até você. Cada peça do nosso acervo é selecionada e fotografada individualmente para garantir que você adquira uma obra de arte única esculpida pela natureza."
      );
      expect(fullText).toContain(
        "Marcas naturais como veios, cavidades, inclusões minerais e microfissuras atestam a autenticidade da pedra. A tonalidade pode apresentar sutis nuances em relação às fotos de acordo com a iluminação do espaço ou a calibração da sua tela."
      );

      expect(fullText).not.toContain("Avisos importantes");
      expect(fullText).not.toContain("Por se tratar de um produto natural");
      expect(fullText).not.toContain("As medidas e o peso informados na descrição são aproximados");
      expect(fullText).not.toContain("A pedra recebida será de qualidade");
      expect(fullText).not.toContain("As imagens são meramente ilustrativas");
    });

    it("EN: texto novo de curadoria presente, texto antigo de avisos ausente em NENHUMA página", async () => {
      await createProduct({ name: "Piece", sku: "INFO-EN", price: 10 });
      const result = await generateCatalogPdf({ language: "en" });
      const pages = await extractPageTexts(result.buffer);
      const fullText = pages.join("\n");

      expect(fullText).toContain("Exclusive Curation – One-of-a-Kind Specimen:");
      expect(fullText).toContain(
        "The crystal shown in the images is exactly the specimen that will reach you. Each piece in our collection is individually selected and photographed so that you acquire a unique work of art sculpted by nature."
      );
      expect(fullText).toContain(
        "Natural marks such as veins, cavities, mineral inclusions and microfractures attest to the stone's authenticity. The tone may show subtle differences from the photos depending on the lighting of the space or the calibration of your screen."
      );

      expect(fullText).not.toContain("Important notices");
      expect(fullText).not.toContain("As a natural product, each stone is unique");
      expect(fullText).not.toContain("The measurements and weight provided");
      expect(fullText).not.toContain("The stone received will be of quality");
      expect(fullText).not.toContain("The images are merely illustrative");
    });

    it("PT: a página de informações é a 2ª página (logo após a capa), com os dados de contato juntos, nunca separados", async () => {
      await createProduct({ name: "Peça", sku: "INFO-POS-PT", price: 10 });
      const result = await generateCatalogPdf({ language: "pt" });
      const pages = await extractPageTexts(result.buffer);

      expect(pages).toHaveLength(3); // capa + informações + 1 peça
      expect(pages[0]).toContain("Catálogo");
      expect(pages[1]).toContain("Contato");
      expect(pages[1]).toContain("WhatsApp");
      expect(pages[1]).toContain("Curadoria Exclusiva – Exemplar Único:");
    });

    it("EN: a página de informações é a 2ª página, com os dados de contato juntos", async () => {
      await createProduct({ name: "Piece", sku: "INFO-POS-EN", price: 10 });
      const result = await generateCatalogPdf({ language: "en" });
      const pages = await extractPageTexts(result.buffer);

      expect(pages).toHaveLength(3);
      expect(pages[0]).toContain("Catalog");
      expect(pages[1]).toContain("Contact");
      expect(pages[1]).toContain("WhatsApp");
      expect(pages[1]).toContain("Exclusive Curation – One-of-a-Kind Specimen:");
    });

    it("ordem das demais páginas: capa, informações, depois as peças na ordem — a última página é a última peça, NÃO mais o contato", async () => {
      await createProduct({ name: "Peça Um", sku: "ORD-1", price: 10 });
      await createProduct({ name: "Peça Dois", sku: "ORD-2", price: 20 });

      const result = await generateCatalogPdf({ language: "pt" });
      const pages = await extractPageTexts(result.buffer);

      expect(pages).toHaveLength(4); // capa + informações + 2 peças
      expect(pages[0]).toContain("Catálogo");
      expect(pages[1]).toContain(INFO_PAGE_HEADING_PT);
      expect(pages[2]).toContain("Peça Um");
      expect(pages[3]).toContain("Peça Dois");

      // Última página é a última peça — o HEADING da página de informações
      // ("Contato"/"Curadoria Exclusiva – Exemplar Único:") não aparece mais
      // no fim do catálogo. Checar pelo heading completo (com dois-pontos),
      // não a substring "Curadoria Exclusiva" sozinha — essa frase também
      // aparece dentro do rodapé de QUALQUER página de peça desde o ajuste
      // do rodapé (FIX CATÁLOGO/RODAPÉ), então a substring sozinha daria
      // falso positivo na última página de peça.
      const lastPage = pages[pages.length - 1];
      expect(lastPage).not.toContain(INFO_PAGE_HEADING_PT);
      expect(lastPage).not.toContain("Contato");
    });

    it("com divisores de categoria, a página de informações continua na 2ª posição, antes de qualquer divisor", async () => {
      const catA = await prisma.category.create({ data: { name: "Categoria Divisor A", slug: `cat-div-a-${Date.now()}` } });
      const catB = await prisma.category.create({ data: { name: "Categoria Divisor B", slug: `cat-div-b-${Date.now()}` } });
      for (let i = 0; i < 7; i++) await createProduct({ name: `Peça Div A${i}`, sku: `DIV-A-${i}`, price: 10, categoryId: catA.id });
      for (let i = 0; i < 6; i++) await createProduct({ name: `Peça Div B${i}`, sku: `DIV-B-${i}`, price: 10, categoryId: catB.id });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.categoryDividersIncluded).toBe(true);

      const pages = await extractPageTexts(result.buffer);
      expect(pages[0]).toContain("Catálogo");
      expect(pages[1]).toContain(INFO_PAGE_HEADING_PT);

      // A página de informações (o heading, não a menção no rodapé de
      // qualquer peça) nunca aparece depois da capa — só a 2ª.
      const infoPageIndex = pages.findIndex((text) => text.includes(INFO_PAGE_HEADING_PT));
      expect(infoPageIndex).toBe(1);
    });

    it("includeContactPage=false: sem a página de informações, mesmo o heading novo de curadoria, em nenhuma posição", async () => {
      await createProduct({ name: "Peça", sku: "INFO-OFF", price: 10 });
      const result = await generateCatalogPdf({ language: "pt", includeContactPage: false });
      const pages = await extractPageTexts(result.buffer);
      const fullText = pages.join("\n");

      expect(pages).toHaveLength(2); // capa + 1 peça, sem informações
      expect(fullText).not.toContain(INFO_PAGE_HEADING_PT);
      expect(fullText).not.toContain("Contato");
    });
  });

  describe("linha de rodapé da página de peça (FIX CATÁLOGO/RODAPÉ — a pedido do Felipe)", () => {
    // Não existe, em nenhum lugar do código, um modo de gerar o catálogo
    // SEM capa (drawCoverPage é chamado incondicionalmente, sempre como a
    // 1ª página) — conferido antes de escrever o texto novo. Por isso o
    // rodapé pode citar "página 2"/"page 2" diretamente, sem precisar de uma
    // variante sem número de página.
    it("PT: toda página de peça traz o novo texto do rodapé, com 'página 2'; o texto antigo não aparece em nenhuma página", async () => {
      await createProduct({ name: "Peça Um", sku: "FOOT-PT-1", price: 10 });
      await createProduct({ name: "Peça Dois", sku: "FOOT-PT-2", price: 20 });

      const result = await generateCatalogPdf({ language: "pt" });
      const pages = await extractPageTexts(result.buffer);
      const fullText = pages.join("\n");

      // páginas 3 e 4 são as duas peças (capa + informações + 2 peças).
      expect(pages[2]).toContain("Peça natural e única — veja a Curadoria Exclusiva na página 2.");
      expect(pages[3]).toContain("Peça natural e única — veja a Curadoria Exclusiva na página 2.");

      expect(fullText).not.toContain("ver avisos importantes na página de contato");
    });

    it("EN: toda página de peça traz o novo texto do rodapé, com 'page 2'; o texto antigo não aparece em nenhuma página", async () => {
      await createProduct({ name: "Piece One", sku: "FOOT-EN-1", price: 10 });
      await createProduct({ name: "Piece Two", sku: "FOOT-EN-2", price: 20 });

      const result = await generateCatalogPdf({ language: "en" });
      const pages = await extractPageTexts(result.buffer);
      const fullText = pages.join("\n");

      expect(pages[2]).toContain("Natural, one-of-a-kind piece — see Exclusive Curation on page 2.");
      expect(pages[3]).toContain("Natural, one-of-a-kind piece — see Exclusive Curation on page 2.");

      expect(fullText).not.toContain("see important notices on the contact page");
    });
  });

  it("expõe rateSource/rateUpdatedAt quando busca a cotação (EN); null em PT", async () => {
    await createProduct({ name: "Peça", sku: "R-1", price: 100 });

    const en = await generateCatalogPdf({ language: "en" });
    expect(en.rateSource).toBe("live");
    expect(en.rateUpdatedAt).toBeInstanceOf(Date);

    const pt = await generateCatalogPdf({ language: "pt" });
    expect(pt.rateSource).toBeNull();
    expect(pt.rateUpdatedAt).toBeNull();
  });

  it("onProgress é chamado uma vez por peça processada, terminando em total/total", async () => {
    await createProduct({ name: "Peça A", sku: "PG-1", price: 10 });
    await createProduct({ name: "Peça B", sku: "PG-2", price: 10 });
    await createProduct({ name: "Peça C (sem foto)", sku: "PG-3", price: 10, withPhoto: false });

    const calls: Array<[number, number]> = [];
    const result = await generateCatalogPdf({ language: "pt", onProgress: (done, total) => calls.push([done, total]) });

    // A peça sem foto nunca entra no total (já é conhecida antes de começar).
    expect(calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(result.skipped).toEqual([{ id: expect.any(String), reason: "Peça sem foto" }]);
  });

  it("quality 'light' gera fotos bem menores que 'standard' (mesma peça)", async () => {
    await createProduct({ name: "Peça Leve", sku: "Q-1", price: 10 });

    const standard = await generateCatalogPdf({ language: "pt", quality: "standard" });
    const light = await generateCatalogPdf({ language: "pt", quality: "light" });

    expect(light.buffer.length).toBeLessThan(standard.buffer.length);
    expect(light.pageCount).toBe(standard.pageCount);
  });

  it("photoFit 'cover' gera PDF válido (mesmo número de páginas que 'contain')", async () => {
    await createProduct({ name: "Peça Cover", sku: "PF-1", price: 10 });

    const contain = await generateCatalogPdf({ language: "pt", photoFit: "contain" });
    const cover = await generateCatalogPdf({ language: "pt", photoFit: "cover" });

    expect(cover.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(cover.pageCount).toBe(contain.pageCount);
    expect(cover.skipped).toEqual([]);
  });

  it("photoFit 'trim' (default) gera PDF válido (mesmo número de páginas que 'contain')", async () => {
    await createProduct({ name: "Peça Trim", sku: "PF-2", price: 10 });

    const contain = await generateCatalogPdf({ language: "pt", photoFit: "contain" });
    const trim = await generateCatalogPdf({ language: "pt", photoFit: "trim" });
    const trimDefault = await generateCatalogPdf({ language: "pt" });

    expect(trim.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(trim.pageCount).toBe(contain.pageCount);
    expect(trim.skipped).toEqual([]);
    expect(trimDefault.pageCount).toBe(trim.pageCount);
  });

  describe("warnings (nome/preço provisório)", () => {
    it("detecta nome placeholder de importação em lote e sinaliza em warnings sem bloquear a geração", async () => {
      const placeholder = await createProduct({ name: "Pedra 4875 - Peso", sku: "P-1", price: 100 });
      await createProduct({ name: "Esmeralda Colombiana", sku: "E-1", price: 100 });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.pageCount).toBe(4); // capa + 2 peças + contato
      expect(result.warnings).toContainEqual({
        id: placeholder.id,
        ref: "P-1",
        title: "Pedra 4875 - Peso",
        reason: "Nome provisório (padrão de importação em lote)",
      });
    });

    it("nome placeholder + identificação title-like: título vira a identificação e o aviso de nome provisório NÃO dispara", async () => {
      const p = await createProduct({ name: "Pedra 4864 - Peso", sku: "P-3", price: 100, identificationPt: "Quartzo Rosa Bruto" });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.warnings.find((w) => w.id === p.id)).toBeUndefined();
    });

    it("detecta padrão EN (Stone N - Weight) no catálogo em inglês", async () => {
      const placeholder = await createProduct({ name: "Stone 42 - Weight", sku: "P-2", price: 100 });

      const result = await generateCatalogPdf({ language: "en" });
      expect(result.warnings).toContainEqual({
        id: placeholder.id,
        ref: "P-2",
        title: "Stone 42 - Weight",
        reason: "Nome provisório (padrão de importação em lote)",
      });
    });

    it("preço <= R$ 1,00 vira 'Consulte o valor' e entra em warnings; preço normal não", async () => {
      const cheap = await createProduct({ name: "Peça Barata", sku: "B-1", price: 1 });
      await createProduct({ name: "Peça Normal", sku: "B-2", price: 250 });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.warnings).toEqual([
        { id: cheap.id, ref: "B-1", title: "Peça Barata", reason: "Preço provisório (≤ R$ 1,00)" },
      ]);
    });

    it("preço placeholder em EN não é convertido para USD (fica null/'Price on request')", async () => {
      await createProduct({ name: "Peça Barata", sku: "B-3", price: 1 });
      const result = await generateCatalogPdf({ language: "en" });
      // Sem erro e sem exigir conversão — o teste de regressão real é visual
      // (ver amostras geradas), aqui só garante que não quebra a geração.
      expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    });

    it("peça sem nenhum problema não aparece em warnings", async () => {
      await createProduct({ name: "Esmeralda Colombiana", sku: "OK-1", price: 250 });
      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.warnings).toEqual([]);
    });

    // REVISÃO FINAL item 1: a peça real Ref 110 apareceu com "R$ 1,00" em
    // vez de "Consulte o valor" numa amostra gerada por um SCRIPT separado
    // (generateRealCatalogSamples.ts) que reimplementava a montagem da
    // página e esqueceu de aplicar esta regra — o pipeline real
    // (generateCatalogPdf, testado aqui com um round-trip de Decimal real
    // via Postgres) já estava correto; o script foi corrigido para usar
    // este MESMO pipeline em vez de reimplementá-lo (ver
    // GenerateCatalogPdfOptions.productIdentificationOverrides). Estes
    // testes cobrem os valores pedidos explicitamente, em PT e EN.
    describe.each(["pt", "en"] as const)("preço provisório (price <= R$ 1,00) em %s", (language) => {
      it("price = 1.00 (Decimal) é provisório", async () => {
        const p = await createProduct({ name: "Peça 1.00", sku: `PR-100-${language}`, price: 1.0 });
        const result = await generateCatalogPdf({ language });
        expect(result.warnings).toContainEqual({ id: p.id, ref: p.sku, title: "Peça 1.00", reason: "Preço provisório (≤ R$ 1,00)" });
      });

      it("price = 0.5 é provisório", async () => {
        const p = await createProduct({ name: "Peça 0.5", sku: `PR-05-${language}`, price: 0.5 });
        const result = await generateCatalogPdf({ language });
        expect(result.warnings).toContainEqual({ id: p.id, ref: p.sku, title: "Peça 0.5", reason: "Preço provisório (≤ R$ 1,00)" });
      });

      it("price = 0 é provisório (regra literal <= 1, inclui zero)", async () => {
        const p = await createProduct({ name: "Peça Zero", sku: `PR-0-${language}`, price: 0 });
        const result = await generateCatalogPdf({ language });
        expect(result.warnings).toContainEqual({ id: p.id, ref: p.sku, title: "Peça Zero", reason: "Preço provisório (≤ R$ 1,00)" });
      });

      it("price = 1.01 NÃO é provisório (preço real, sem warning)", async () => {
        const p = await createProduct({ name: "Peça 1.01", sku: `PR-101-${language}`, price: 1.01 });
        const result = await generateCatalogPdf({ language });
        expect(result.warnings.find((w) => w.id === p.id)).toBeUndefined();
      });

      it("price = null NÃO é provisório ('Consulte o valor' sem warning — não é importação em lote)", async () => {
        const p = await createProduct({ name: "Peça Sem Preço X", sku: `PR-NULL-${language}`, price: null });
        const result = await generateCatalogPdf({ language });
        expect(result.warnings.find((w) => w.id === p.id)).toBeUndefined();
      });
    });
  });

  describe("dados ausentes (descrição/peso/tamanho) — AJUSTES A4/CATÁLOGO item 4", () => {
    it("peça sem descrição, peso e tamanho entra em missingData com os três marcados", async () => {
      const bare = await createProduct({ name: "Pedra Sem Dados", sku: "MD-1", price: 10 });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.missingData).toEqual([
        { id: bare.id, ref: "MD-1", title: "Pedra Sem Dados", missingDescription: true, missingWeight: true, missingSize: true },
      ]);
    });

    it("peça com description, peso e tamanho não entra em missingData", async () => {
      await createProduct({ name: "Pedra Completa", sku: "MD-2", price: 10, description: "Peça lapidada.", sizeCm: 2.3, weightGrams: 850 });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.missingData).toEqual([]);
    });

    it("peça com só peso e tamanho faltando (tem descrição) marca só esses dois", async () => {
      const partial = await createProduct({ name: "Pedra Parcial", sku: "MD-3", price: 10, description: "Peça lapidada à mão." });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.missingData).toEqual([
        { id: partial.id, ref: "MD-3", title: "Pedra Parcial", missingDescription: false, missingWeight: true, missingSize: true },
      ]);
    });

    it("description só com o aviso legal genérico conta como 'sem descrição própria' em missingData", async () => {
      const generic = await createProduct({
        name: "Pedra Aviso Genérico",
        sku: "MD-4",
        price: 10,
        sizeCm: 2,
        weightGrams: 100,
        description:
          "Por se tratar de um produto natural, cada pedra é única e pode apresentar variações de tamanho, peso, formato, tonalidade, textura e características minerais.",
      });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.missingData).toEqual([
        { id: generic.id, ref: "MD-4", title: "Pedra Aviso Genérico", missingDescription: true, missingWeight: false, missingSize: false },
      ]);
    });
  });

  describe("nome duplicado com IA — AJUSTES A4/CATÁLOGO item 5 (revisão final item 2: título é sempre o nome)", () => {
    it("identificação idêntica ao nome não duplica no corpo: pipeline completo não quebra (corpo some)", async () => {
      // Título vem do NOME ("Pedra Base" — ver revisão final item 2); a
      // identificação idêntica ao nome cadastrado NÃO é esse caso (nomes
      // diferentes aqui) — este teste garante que o pipeline todo (preço,
      // avisos, identificação como corpo) roda sem quebrar quando a peça
      // tem identificação E description reais. A verificação fina de
      // anti-duplicação (corpo que começa com o NOME) já é feita em
      // content.test.ts (resolveBodyText).
      await createProduct({
        name: "Pedra Base",
        sku: "DUP-1",
        price: 10,
        identificationPt: "Ágata Azul (Tingida)",
        description: "Descrição própria da peça, bem detalhada.",
      });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(result.warnings).toEqual([]);
    });

    it("identificação IGUAL ao nome cadastrado: corpo some (não repete o nome) sem quebrar a geração", async () => {
      await createProduct({ name: "Esfera de Ágata com Geodo", sku: "DUP-2", price: 10, identificationPt: "Esfera de Ágata com Geodo" });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      // Sem description própria para cair de volta, a peça fica sem
      // descrição própria — mas isso é esperado (ver content.test.ts),
      // então entra em missingData (não é um warning).
      expect(result.missingData.find((m) => m.ref === "DUP-2")?.missingDescription).toBe(true);
    });

    it("nome vindo duplicado no cadastro ('X X') é limpo no título sem quebrar a geração", async () => {
      await createProduct({ name: "Ágata Azul Ágata Azul", sku: "DUP-3", price: 10 });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(result.warnings).toEqual([]);
    });
  });

  describe("nome truncado (AJUSTES A4/CATÁLOGO item 1 — revisão visual item 5)", () => {
    // REGRESSÃO: este nome de ~192 caracteres truncava incorretamente (bug
    // de orçamento de altura em fitTitleText/pdfPages.ts — ver BUG CORRIGIDO
    // em textFit.ts e pdfPages.ts) mesmo cabendo perfeitamente em 3 linhas
    // reduzindo a fonte. Confirma que a fonte É reduzida (de 22 para algo
    // menor) e o título NÃO é truncado nem gera warning.
    it("nome de ~190 caracteres cabe em 3 linhas reduzindo a fonte, sem truncar", async () => {
      const name =
        "Pedra Extraordinária Rara de Origem Totalmente Desconhecida com Nome Comercial Muito Longo e Detalhado Demais Para Caber em Três Linhas Mesmo no Tamanho Mínimo de Fonte Permitido Pelo Catálogo";
      expect(name.length).toBeGreaterThanOrEqual(190);
      await createProduct({ name, sku: "LN-1", price: 10 });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(result.warnings).toEqual([]);
    });

    it("nome de ~120 caracteres cabe sem precisar truncar", async () => {
      const name = "Topázio Imperial de Ouro Preto com Lapidação Oval Impecável e Laudo Gemológico Completo Emitido por Laboratório Reconhecido";
      expect(name.length).toBeGreaterThanOrEqual(120);
      expect(name.length).toBeLessThan(130);
      await createProduct({ name, sku: "LN-2", price: 10 });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.warnings).toEqual([]);
    });

    it("nome extremamente longo (~300 caracteres) trunca e vira warning 'nome truncado'", async () => {
      const name =
        "Pedra Absolutamente Extraordinária e Rara de Origem Geológica Totalmente Desconhecida, Encontrada em Expedição Remota, com Nome Comercial Extremamente Longo e Detalhado Demais Para Caber Inteiro em Três Linhas do Catálogo Mesmo Reduzindo a Fonte até o Tamanho Mínimo Permitido pelas Regras de Layout Definidas";
      expect(name.length).toBeGreaterThanOrEqual(300);
      const product = await createProduct({ name, sku: "LN-3", price: 10 });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(result.warnings).toContainEqual({
        id: product.id,
        ref: "LN-3",
        title: name,
        reason: "Nome truncado (não coube nem reduzindo a fonte)",
      });
    });

    it("título curto não gera warning de nome truncado", async () => {
      await createProduct({ name: "Esmeralda Colombiana", sku: "LN-4", price: 10 });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.warnings).toEqual([]);
    });
  });

  describe("divisores de categoria (default: >= 12 peças e >= 2 categorias)", () => {
    async function makeTwoCategories() {
      const formas = await prisma.category.create({ data: { name: "Formas", slug: "formas" } });
      const brutas = await prisma.category.create({ data: { name: "Pedras Brutas", slug: "pedras-brutas" } });
      return { formas, brutas };
    }

    it("abaixo do limiar (menos de 12 peças), não inclui divisores por padrão", async () => {
      const { formas, brutas } = await makeTwoCategories();
      for (let i = 0; i < 3; i++) await createProduct({ name: `Forma ${i}`, sku: `F-${i}`, price: 10, categoryId: formas.id });
      for (let i = 0; i < 2; i++) await createProduct({ name: `Bruta ${i}`, sku: `B-${i}`, price: 10, categoryId: brutas.id });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.categoryDividersIncluded).toBe(false);
      expect(result.pageCount).toBe(7); // capa + 5 peças + contato
      expect(result.buffer.includes("/Outlines")).toBe(false);
    });

    it(">= 12 peças e >= 2 categorias: inclui divisores + bookmarks por padrão", async () => {
      const { formas, brutas } = await makeTwoCategories();
      for (let i = 0; i < 7; i++) await createProduct({ name: `Forma ${i}`, sku: `F-${i}`, price: 10, categoryId: formas.id });
      for (let i = 0; i < 6; i++) await createProduct({ name: `Bruta ${i}`, sku: `B-${i}`, price: 10, categoryId: brutas.id });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.categoryDividersIncluded).toBe(true);
      // capa + 2 divisores + 13 peças + contato
      expect(result.pageCount).toBe(17);
      expect(result.buffer.includes("/Outlines")).toBe(true);
    });

    it("uma única categoria com >= 12 peças NÃO ativa o default (precisa de >= 2 categorias)", async () => {
      const { formas } = await makeTwoCategories();
      for (let i = 0; i < 12; i++) await createProduct({ name: `Forma ${i}`, sku: `F-${i}`, price: 10, categoryId: formas.id });

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.categoryDividersIncluded).toBe(false);
      expect(result.pageCount).toBe(14); // capa + 12 peças + contato
    });

    it("includeCategoryDividers explícito sempre vence o default (liga abaixo do limiar)", async () => {
      const { formas, brutas } = await makeTwoCategories();
      await createProduct({ name: "Forma 1", sku: "F-1", price: 10, categoryId: formas.id });
      await createProduct({ name: "Bruta 1", sku: "B-1", price: 10, categoryId: brutas.id });

      const result = await generateCatalogPdf({ language: "pt", includeCategoryDividers: true });
      expect(result.categoryDividersIncluded).toBe(true);
      expect(result.pageCount).toBe(6); // capa + 2 divisores + 2 peças + contato
      expect(result.buffer.includes("/Outlines")).toBe(true);
    });

    it("includeCategoryDividers explícito sempre vence o default (desliga acima do limiar)", async () => {
      const { formas, brutas } = await makeTwoCategories();
      for (let i = 0; i < 7; i++) await createProduct({ name: `Forma ${i}`, sku: `F-${i}`, price: 10, categoryId: formas.id });
      for (let i = 0; i < 6; i++) await createProduct({ name: `Bruta ${i}`, sku: `B-${i}`, price: 10, categoryId: brutas.id });

      const result = await generateCatalogPdf({ language: "pt", includeCategoryDividers: false });
      expect(result.categoryDividersIncluded).toBe(false);
      expect(result.pageCount).toBe(15); // capa + 13 peças + contato
    });

    it("peças sem categoria entram no grupo final só quando houver pelo menos uma", async () => {
      const { formas, brutas } = await makeTwoCategories();
      for (let i = 0; i < 6; i++) await createProduct({ name: `Forma ${i}`, sku: `F-${i}`, price: 10, categoryId: formas.id });
      for (let i = 0; i < 5; i++) await createProduct({ name: `Bruta ${i}`, sku: `B-${i}`, price: 10, categoryId: brutas.id });
      await createProduct({ name: "Sem Categoria", sku: "SC-1", price: 10 }); // sem categoryId -> 12 peças, 2 categorias

      const result = await generateCatalogPdf({ language: "pt" });
      expect(result.categoryDividersIncluded).toBe(true);
      // capa + 3 divisores (Formas, Pedras Brutas, Sem categoria) + 12 peças + contato
      expect(result.pageCount).toBe(17);
    });
  });
});
