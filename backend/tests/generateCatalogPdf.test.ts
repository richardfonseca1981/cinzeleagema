import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
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
