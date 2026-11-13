import { resolveTitle, resolveBodyText, type CatalogProductContent } from "../catalog/content";
import { GEMSTONE_CATEGORY_FIXTURE, ML_FIXME_CATEGORY_ID, type MercadoLivreCategoryFixture } from "./categoryFixture";
import { ML_MAX_PHOTOS, ML_TITLE_MAX_CHARS } from "./listingValidator";

export interface ListingBuilderImage {
  url: string;
  position: number;
}

// 'NATURAL' | 'TINGIDA' | 'POSSIVEL_TINGIMENTO' | 'SEM_INDICIO' | null — ver
// Product.identificationTreatment no schema.
export interface ListingBuilderInput extends CatalogProductContent {
  identificationTreatment: string | null;
  images: ListingBuilderImage[];
}

export interface MercadoLivreListingDraft {
  title: string;
  titleTruncated: boolean;
  description: string;
  photos: string[];
  photosOmitted: number;
  category: MercadoLivreCategoryFixture;
}

// Disclosure de tratamento na descrição — exigência de honestidade do
// anúncio, não só convenção interna (ver Product.identificationTreatment no
// schema: "triagem visual, NUNCA um laudo gemológico").
const TREATMENT_DISCLOSURE: Record<string, string> = {
  TINGIDA: "Atenção: pedra tingida artificialmente (tratamento de cor).",
  POSSIVEL_TINGIMENTO: "Atenção: possível tingimento/tratamento de cor — triagem visual, sem laudo gemológico.",
};

function truncateTitle(title: string): { value: string; truncated: boolean } {
  if (title.length <= ML_TITLE_MAX_CHARS) return { value: title, truncated: false };
  return { value: `${title.slice(0, ML_TITLE_MAX_CHARS - 1).trimEnd()}…`, truncated: true };
}

// Monta o rascunho do anúncio a partir de uma peça já validada como apta
// (ver listingValidator.ts) — esta função não valida nada, assume que o
// chamador já checou elegibilidade. Fase 1A: só simulação, nenhuma chamada à
// API do Mercado Livre.
export function buildListingDraft(product: ListingBuilderInput): MercadoLivreListingDraft {
  const title = resolveTitle(product, "pt");
  const { value: finalTitle, truncated } = truncateTitle(title);

  const body = resolveBodyText(product, "pt", title);
  const disclosure = product.identificationTreatment ? TREATMENT_DISCLOSURE[product.identificationTreatment] : null;
  const descriptionParts = [body?.text, disclosure].filter((part): part is string => Boolean(part?.trim()));
  const description =
    descriptionParts.length > 0 ? descriptionParts.join("\n\n") : "Sem descrição cadastrada — revisar antes de publicar.";

  const orderedImages = [...product.images].sort((a, b) => a.position - b.position);
  const photos = orderedImages.slice(0, ML_MAX_PHOTOS).map((img) => img.url);

  return {
    title: finalTitle,
    titleTruncated: truncated,
    description,
    photos,
    photosOmitted: Math.max(0, orderedImages.length - ML_MAX_PHOTOS),
    category: GEMSTONE_CATEGORY_FIXTURE,
  };
}

// Reaproveitável pela Fase 1B (POST /items, fora do escopo desta fase):
// garante que nenhuma publicação real aconteça enquanto a categoria do
// rascunho ainda for o placeholder não verificado desta fase (ver
// categoryFixture.ts). Nenhuma rota chama esta função ainda.
export function assertReadyToPublish(draft: MercadoLivreListingDraft): void {
  if (!draft.category.verified || draft.category.id === ML_FIXME_CATEGORY_ID) {
    throw new Error(
      `Categoria do Mercado Livre ainda não verificada (placeholder "${draft.category.id}") — publicação bloqueada até confirmar a categoria real via API.`
    );
  }
}
