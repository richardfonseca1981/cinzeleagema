import { describe, expect, it } from "vitest";
import { env } from "../src/lib/env";
import {
  buildListingDraft,
  assertReadyToPublish,
  ListingNotReadyError,
  type ListingBuilderInput,
} from "../src/lib/mercadoLivre/listingBuilder";
import { ML_FIXME_CATEGORY_ID } from "../src/lib/mercadoLivre/categoryFixture";
import { ML_MAX_PHOTOS, ML_TITLE_MAX_CHARS } from "../src/lib/mercadoLivre/listingValidator";

function baseProduct(overrides: Partial<ListingBuilderInput> = {}): ListingBuilderInput {
  return {
    name: "Esmeralda Colombiana 2.3ct",
    nameEn: null,
    sku: "ESM-001",
    description: "Peça lapidada, brilho intenso.",
    descriptionEn: null,
    identificationPt: null,
    identificationEn: null,
    identificationTreatment: null,
    weightGrams: 500,
    sizeCm: 10,
    images: [
      { url: "https://r2.example/esm-1.webp", position: 0 },
      { url: "https://r2.example/esm-2.webp", position: 1 },
    ],
    ...overrides,
  };
}

describe("buildListingDraft", () => {
  it("usa o nome cadastrado como título, sem truncar quando cabe em 60 chars", () => {
    const draft = buildListingDraft(baseProduct());
    expect(draft.title).toBe("Esmeralda Colombiana 2.3ct");
    expect(draft.titleTruncated).toBe(false);
  });

  it(`trunca título maior que ${ML_TITLE_MAX_CHARS} chars e sinaliza titleTruncated`, () => {
    const longName = "Esmeralda Colombiana Lapidação Especial Com Certificado Internacional de Origem";
    const draft = buildListingDraft(baseProduct({ name: longName }));
    expect(draft.title.length).toBeLessThanOrEqual(ML_TITLE_MAX_CHARS);
    expect(draft.titleTruncated).toBe(true);
    expect(draft.title.endsWith("…")).toBe(true);
  });

  it("usa a description como corpo do anúncio quando não há disclosure de tratamento", () => {
    const draft = buildListingDraft(baseProduct());
    expect(draft.description).toContain("Peça lapidada, brilho intenso.");
  });

  it("acrescenta disclosure de tratamento quando a peça foi identificada como tingida", () => {
    const draft = buildListingDraft(baseProduct({ identificationTreatment: "TINGIDA" }));
    expect(draft.description).toContain("tingida artificialmente");
  });

  it("cai para um texto padrão quando não há description nem identificação", () => {
    const draft = buildListingDraft(baseProduct({ description: null, identificationPt: null }));
    expect(draft.description).toBe("Sem descrição cadastrada — revisar antes de publicar.");
  });

  it("ordena as fotos por position", () => {
    const draft = buildListingDraft(
      baseProduct({
        images: [
          { url: "segunda", position: 1 },
          { url: "primeira", position: 0 },
        ],
      })
    );
    expect(draft.photos).toEqual(["primeira", "segunda"]);
  });

  it(`corta em ${ML_MAX_PHOTOS} fotos e reporta quantas ficaram de fora`, () => {
    const images = Array.from({ length: 15 }, (_, i) => ({ url: `foto-${i}`, position: i }));
    const draft = buildListingDraft(baseProduct({ images }));
    expect(draft.photos).toHaveLength(ML_MAX_PHOTOS);
    expect(draft.photosOmitted).toBe(3);
  });

  it("marca a categoria como a fixture não verificada", () => {
    const draft = buildListingDraft(baseProduct());
    expect(draft.category.id).toBe(ML_FIXME_CATEGORY_ID);
    expect(draft.category.verified).toBe(false);
  });

  it("estima a caixa/peso de embalagem a partir de weightGrams/sizeCm (ver packagePresets.ts)", () => {
    const draft = buildListingDraft(baseProduct({ weightGrams: 500, sizeCm: 10 }));
    expect(draft.packageBox).toEqual({ ok: true, source: "preset", preset: "P", box: expect.any(Object), packageWeightGrams: 500 + env.ML_PACKAGE_WEIGHT_MARGIN_G });
  });

  it("peça fora das faixas de preset (ex.: obelisco de 62cm) gera packageBox ok:false", () => {
    const draft = buildListingDraft(baseProduct({ weightGrams: 3000, sizeCm: 62 }));
    expect(draft.packageBox).toEqual({ ok: false, reason: "size_exceeds_limit" });
  });
});

describe("assertReadyToPublish", () => {
  it("lança enquanto a categoria for o placeholder não verificado", () => {
    const draft = buildListingDraft(baseProduct());
    expect(() => assertReadyToPublish(draft)).toThrow(/placeholder/);
  });

  it("lança com code category_not_verified enquanto a categoria for o placeholder", () => {
    const draft = buildListingDraft(baseProduct());
    let error: unknown;
    try {
      assertReadyToPublish(draft);
    } catch (err) {
      error = err;
    }
    expect((error as ListingNotReadyError).code).toBe("category_not_verified");
  });

  it("não lança quando a categoria estiver marcada como verificada e a embalagem couber num preset", () => {
    const draft = buildListingDraft(baseProduct());
    const verifiedDraft = { ...draft, category: { id: "MLB123456", breadcrumb: draft.category.breadcrumb, verified: true } };
    expect(() => assertReadyToPublish(verifiedDraft)).not.toThrow();
  });

  it("lança package_requires_manual quando a peça excede o maior preset, mesmo com categoria verificada", () => {
    const draft = buildListingDraft(baseProduct({ weightGrams: 16800, sizeCm: 20 }));
    const verifiedDraft = { ...draft, category: { id: "MLB123456", breadcrumb: draft.category.breadcrumb, verified: true } };
    let error: unknown;
    try {
      assertReadyToPublish(verifiedDraft);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ListingNotReadyError);
    expect((error as ListingNotReadyError).code).toBe("package_requires_manual");
    expect((error as Error).message).toContain("package_requires_manual");
  });

  it("casos extremos do catálogo: obelisco (62cm) e capela (16,8kg) bloqueiam; esfera mínima (1,6cm/6g) não bloqueia", () => {
    const verify = (draft: ReturnType<typeof buildListingDraft>) => ({
      ...draft,
      category: { id: "MLB123456", breadcrumb: draft.category.breadcrumb, verified: true },
    });

    const obelisco = verify(buildListingDraft(baseProduct({ weightGrams: 3000, sizeCm: 62 })));
    expect(() => assertReadyToPublish(obelisco)).toThrow(/package_requires_manual/);

    const capela = verify(buildListingDraft(baseProduct({ weightGrams: 16800, sizeCm: 20 })));
    expect(() => assertReadyToPublish(capela)).toThrow(/package_requires_manual/);

    const esfera = verify(buildListingDraft(baseProduct({ weightGrams: 6, sizeCm: 1.6 })));
    expect(() => assertReadyToPublish(esfera)).not.toThrow();
    expect(esfera.packageBox).toEqual({ ok: true, source: "preset", preset: "P", box: expect.any(Object), packageWeightGrams: 6 + env.ML_PACKAGE_WEIGHT_MARGIN_G });
  });
});
