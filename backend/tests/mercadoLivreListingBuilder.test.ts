import { describe, expect, it } from "vitest";
import { buildListingDraft, assertReadyToPublish, type ListingBuilderInput } from "../src/lib/mercadoLivre/listingBuilder";
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
});

describe("assertReadyToPublish", () => {
  it("lança enquanto a categoria for o placeholder não verificado", () => {
    const draft = buildListingDraft(baseProduct());
    expect(() => assertReadyToPublish(draft)).toThrow(/placeholder/);
  });

  it("não lança quando a categoria estiver marcada como verificada e não for o placeholder", () => {
    const draft = buildListingDraft(baseProduct());
    const verifiedDraft = { ...draft, category: { id: "MLB123456", breadcrumb: draft.category.breadcrumb, verified: true } };
    expect(() => assertReadyToPublish(verifiedDraft)).not.toThrow();
  });
});
