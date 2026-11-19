import { env } from "../env";
import { resolveTitle, resolveBodyText, type CatalogProductContent } from "../catalog/content";
import { GEMSTONE_CATEGORY_FIXTURE, ML_FIXME_CATEGORY_ID, type MercadoLivreCategoryFixture } from "./categoryFixture";
import { ML_MAX_PHOTOS, ML_TITLE_MAX_CHARS } from "./listingValidator";
import { generateSingleTitleSuggestion } from "./titleGenerator";
import {
  estimatePackageBox,
  getPackageOverrideCeilings,
  getPackagePresetsConfig,
  type PackageBoxEstimate,
  type PackageBoxSource,
} from "./packagePresets";

// width/height exigidos (nullable, nunca ausentes) desde a etapa "título
// aprovado" — necessários pra passar a mesma peça direto pro titleGenerator
// (ver resolveDraftTitle abaixo) sem reconstruir o objeto.
export interface ListingBuilderImage {
  url: string;
  position: number;
  width: number | null;
  height: number | null;
}

// 'NATURAL' | 'TINGIDA' | 'POSSIVEL_TINGIMENTO' | 'SEM_INDICIO' | null — ver
// Product.identificationTreatment no schema.
export interface ListingBuilderInput extends CatalogProductContent {
  id: string;
  identificationTreatment: string | null;
  images: ListingBuilderImage[];
  weightGrams: unknown; // Decimal do Prisma ou já convertido — idem ListingValidationInput.
  sizeCm: unknown;
  price: unknown;
  active: boolean;
  trackStock: boolean;
  stockQty: number | null;
  // Título APROVADO (ver schema.prisma Product.mlTitle/mlTitleApprovedAt) —
  // fonte única de título do anúncio (ver resolveDraftTitle abaixo).
  mlTitle: string | null;
  mlTitleApprovedAt: Date | null;
  // Fase 1B etapa 10 — override manual de embalagem (ver schema.prisma
  // Product.mlPackageOverride*) — opcionais pra não quebrar nenhum chamador/
  // fixture de teste anterior a esta etapa (ausentes = sem override, mesmo
  // comportamento de antes).
  mlPackageOverrideLengthCm?: unknown;
  mlPackageOverrideWidthCm?: unknown;
  mlPackageOverrideHeightCm?: unknown;
  mlPackageOverrideWeightG?: unknown;
}

export interface MercadoLivreListingDraft {
  title: string;
  titleTruncated: boolean;
  // true só quando o título veio de Product.mlTitle COM mlTitleApprovedAt
  // preenchido — false quando caiu no fallback (sugestão A do
  // titleGenerator, ver resolveDraftTitle). getReadinessIssues/
  // assertReadyToPublish bloqueiam a publicação real enquanto for false
  // (code "title_not_approved").
  titleApproved: boolean;
  description: string;
  photos: string[];
  photosOmitted: number;
  category: MercadoLivreCategoryFixture;
  // Preço BASE da peça (Product.price, sem markup) — usado só por
  // getReadinessIssues/assertReadyToPublish pra checar ML_MIN_LISTING_PRICE
  // (ver lib/env.ts); o preço de ANÚNCIO (com markup) nunca passa por aqui,
  // continua vindo de fora (ver publisherPayload.ts listingPriceBRL).
  basePrice: number;
  // Estimativa de caixa/peso de embalagem (Fase 1B etapa 4, ver
  // packagePresets.ts) — `ok: false` quando a peça excede o maior preset
  // (GG) e precisa de override manual; assertReadyToPublish abaixo bloqueia
  // a publicação nesse caso.
  packageBox: PackageBoxEstimate;
  // Fase 1B etapa 10 — espelha `packageBox.source` quando `ok: true`, `null`
  // quando bloqueado. Campo próprio no draft (em vez de só dentro de
  // packageBox) porque é a origem explicitamente pedida pra aparecer na
  // simulação/prévia/CSV.
  packageBoxSource: PackageBoxSource | null;
}

// Fonte ÚNICA de título do anúncio (listingBuilder, publisherPayload, script
// de simulação e tela do admin — todos passam por buildListingDraft, nunca
// decidem título por fora): Product.mlTitle só conta como aprovado com
// mlTitleApprovedAt preenchido; sem isso, cai pra sugestão A do
// titleGenerator (gerada só com esta peça, sem o contexto de desduplicação
// do catálogo inteiro — essa dedup é exclusiva da tela de aprovação, ver GET
// /title-suggestions/:productId). Sem NENHUMA sugestão possível (caso
// degenerado, titleGenerator não produziu titleA), cai pro nome resolvido
// puro — nunca string vazia.
function resolveDraftTitle(product: ListingBuilderInput): { title: string; approved: boolean } {
  const approvedTitle = product.mlTitle?.trim();
  if (approvedTitle && product.mlTitleApprovedAt) {
    return { title: approvedTitle, approved: true };
  }

  const suggestion = generateSingleTitleSuggestion(product);
  return { title: suggestion?.titleA ?? resolveTitle(product, "pt"), approved: false };
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

function toNumberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Monta o rascunho do anúncio a partir de uma peça já validada como apta
// (ver listingValidator.ts) — esta função não valida nada, assume que o
// chamador já checou elegibilidade. Fase 1A: só simulação, nenhuma chamada à
// API do Mercado Livre.
export function buildListingDraft(product: ListingBuilderInput): MercadoLivreListingDraft {
  const title = resolveTitle(product, "pt");
  const body = resolveBodyText(product, "pt", title);

  // Título do ANÚNCIO (diferente de `title` acima, que é só o nome
  // resolvido do catálogo, usado pela descrição/disclosure) — ver
  // resolveDraftTitle: mlTitle aprovado > sugestão A do titleGenerator.
  // truncateTitle aqui é só uma rede de segurança (mlTitle já é validado em
  // <= 60 chars na escrita, ver schemas/product.schema.ts; a sugestão
  // gerada também já respeita o limite) — nunca deveria disparar na prática.
  const { title: draftTitleSource, approved: titleApproved } = resolveDraftTitle(product);
  const { value: finalTitle, truncated } = truncateTitle(draftTitleSource);
  const disclosure = product.identificationTreatment ? TREATMENT_DISCLOSURE[product.identificationTreatment] : null;
  const descriptionParts = [body?.text, disclosure].filter((part): part is string => Boolean(part?.trim()));
  const description =
    descriptionParts.length > 0 ? descriptionParts.join("\n\n") : "Sem descrição cadastrada — revisar antes de publicar.";

  const orderedImages = [...product.images].sort((a, b) => a.position - b.position);
  const photos = orderedImages.slice(0, ML_MAX_PHOTOS).map((img) => img.url);

  // weightGrams/sizeCm chegam aqui já validados (> 0) por quem monta o
  // draft — validateListing bloqueia "missing_weight"/"missing_size" ANTES
  // de qualquer chamador real chegar a buildListingDraft (ver
  // mercadoLivre.routes.ts e scripts/simulateMercadoLivre.ts). 0 como
  // fallback é só defensivo (ex.: teste chamando esta função direto) — cai
  // no preset P sem lançar, nunca mascarando um bug de verdade porque os
  // chamadores reais nunca deixam chegar aqui com 0.
  const packageBox = estimatePackageBox(
    toNumberOrZero(product.weightGrams),
    toNumberOrZero(product.sizeCm),
    getPackagePresetsConfig(env),
    {
      lengthCm: product.mlPackageOverrideLengthCm,
      widthCm: product.mlPackageOverrideWidthCm,
      heightCm: product.mlPackageOverrideHeightCm,
      weightG: product.mlPackageOverrideWeightG,
    },
    getPackageOverrideCeilings(env)
  );

  return {
    title: finalTitle,
    titleTruncated: truncated,
    titleApproved,
    packageBoxSource: packageBox.ok ? packageBox.source : null,
    description,
    photos,
    photosOmitted: Math.max(0, orderedImages.length - ML_MAX_PHOTOS),
    category: GEMSTONE_CATEGORY_FIXTURE,
    basePrice: toNumberOrZero(product.price),
    packageBox,
  };
}

// Erro tipado (não um Error genérico) — o builder do payload de publicação
// (publisherPayload.ts, Fase 1B) precisa distinguir "peça não pronta pra
// publicar" de qualquer outro bug/erro inesperado na montagem do payload,
// sem checar o texto da mensagem. `code` (opcional, "unknown" por padrão)
// deixa quem chama (ex.: scripts/simulateMercadoLivre.ts) distinguir o
// MOTIVO do bloqueio sem precisar fazer regex na mensagem — útil agora que
// assertReadyToPublish tem mais de um motivo possível (categoria vs.
// embalagem, ver abaixo).
export type ListingNotReadyCode = "category_not_verified" | "title_not_approved" | "package_requires_manual";

export class ListingNotReadyError extends Error {
  constructor(message: string, public readonly code: ListingNotReadyCode | "unknown" = "unknown") {
    super(message);
    this.name = "ListingNotReadyError";
  }
}

// Todos os motivos (não só o primeiro) pelos quais este draft ainda não
// pode ser publicado de verdade — categoria e embalagem são checagens
// INDEPENDENTES entre si, então um chamador que só quer REPORTAR o estado
// (script de simulação, rota admin) precisa ver os dois quando os dois se
// aplicarem, não só o primeiro que bloquearia. assertReadyToPublish (abaixo)
// usa esta mesma lista pra decidir o que lançar, mantendo os dois lugares
// sempre de acordo sobre o que conta como "não pronto".
export function getReadinessIssues(draft: MercadoLivreListingDraft): ListingNotReadyCode[] {
  const issues: ListingNotReadyCode[] = [];
  if (!draft.category.verified || draft.category.id === ML_FIXME_CATEGORY_ID) issues.push("category_not_verified");
  if (!draft.titleApproved) issues.push("title_not_approved");
  if (!draft.packageBox.ok) issues.push("package_requires_manual");
  return issues;
}

// Garante que nenhuma publicação real aconteça enquanto: (1) a categoria do
// rascunho ainda for o placeholder não verificado desta fase (ver
// categoryFixture.ts), ou (2) a peça exceder o maior preset de embalagem
// (GG) disponível, ver packagePresets.ts — nesse caso NUNCA publica com uma
// caixa "chutada", só com um override manual (etapa futura). Chamada pelo
// builder do payload (publisherPayload.ts) ANTES de montar qualquer campo —
// nunca monta payload parcial. Lança no PRIMEIRO motivo encontrado (mesma
// ordem de getReadinessIssues: categoria sempre antes de embalagem) — quem
// precisa da lista completa usa getReadinessIssues diretamente.
export function assertReadyToPublish(draft: MercadoLivreListingDraft): void {
  if (!draft.category.verified || draft.category.id === ML_FIXME_CATEGORY_ID) {
    throw new ListingNotReadyError(
      `Categoria do Mercado Livre ainda não verificada (placeholder "${draft.category.id}") — publicação bloqueada até confirmar a categoria real via API.`,
      "category_not_verified"
    );
  }
  if (!draft.titleApproved) {
    throw new ListingNotReadyError(
      "Título do anúncio ainda não foi aprovado — aprove um mlTitle (ou use a sugestão gerada) antes de publicar de verdade (title_not_approved).",
      "title_not_approved"
    );
  }
  if (!draft.packageBox.ok) {
    throw new ListingNotReadyError(
      `Peça fora das faixas de preset de embalagem (motivo: ${draft.packageBox.reason}) — publicação bloqueada até existir um override manual de caixa/peso (package_requires_manual).`,
      "package_requires_manual"
    );
  }
}
