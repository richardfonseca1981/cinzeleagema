import { env } from "../env";
import { validateListing, type ListingValidationInput } from "./listingValidator";
import {
  buildListingDraft,
  assertReadyToPublish,
  getReadinessIssues,
  ListingNotReadyError,
  type ListingNotReadyCode,
  type ListingBuilderInput,
  type MercadoLivreListingDraft,
} from "./listingBuilder";

// Fase 1B — monta o payload de POST /items a partir de uma peça do catálogo.
// Formato geral (campos abaixo) é conhecimento prévio da API pública do
// Mercado Livre, NÃO confirmado contra a doc atual — 403 anti-bot bloqueou
// as 3 tentativas de consulta durante o planejamento desta fase, mesmo
// bloqueio documentado em categoryFixture.ts (ver CONTEXT.md "Mercado Livre
// — Fase 1B, débitos"). `shipping.dimensions` vem do preset de embalagem
// estimado pelo builder (ver packagePresets.ts/listingBuilder.ts
// draft.packageBox) — formato da string também é suposição não verificada.
// Intersecção (não `extends`): os dois `images` só diferem no que cada um
// adiciona (width/height vs. url/position) — mesmo padrão de
// scripts/simulateMercadoLivre.ts SimulationProduct, que já resolve isso
// assim. `extends` exigiria os dois tipos de `images` IDÊNTICOS.
export type MercadoLivrePublishableProduct = ListingValidationInput & ListingBuilderInput;

export interface MercadoLivreItemPicture {
  source: string;
}

// SUPOSIÇÃO FORTE, não verificada: formato de "dimensions" como string
// "LxWxHcm,pesoG" é conhecimento prévio histórico da API pública — não
// confirmado contra a doc atual (mesmo bloqueio 403, ver categoryFixture.ts
// e CONTEXT.md "débitos"). Omitido do payload inteiro quando packageBox não
// pôde ser estimado (ver assemblePayload) — mas isso nunca acontece pelo
// fluxo real (buildMercadoLivreItemPayload), que já bloqueia em
// assertReadyToPublish antes de chegar aqui.
export interface MercadoLivreItemShipping {
  dimensions: string;
}

export interface MercadoLivreItemPayload {
  title: string;
  category_id: string;
  price: number;
  currency_id: "BRL";
  available_quantity: 1;
  buying_mode: "buy_it_now";
  listing_type_id: string;
  condition: "new";
  pictures: MercadoLivreItemPicture[];
  // SUPOSIÇÃO não verificada: "seller_custom_field" é o campo público
  // conhecido historicamente pra carregar o SKU do vendedor — pode ser um
  // atributo customizado em vez disso (só confirmável com a API real).
  // Omitido quando a peça não tem SKU cadastrado — nesse caso a
  // reconciliação por SKU (findItemsBySku, ver publisherClient.ts) nunca
  // encontra este item, limitação conhecida e aceita nesta fase.
  seller_custom_field?: string;
  shipping?: MercadoLivreItemShipping;
}

export interface BuildMercadoLivreItemPayloadInput {
  product: MercadoLivrePublishableProduct;
  // Preço FINAL de anúncio, já com markup aplicado (ver
  // priceCalculator.ts calculateSuggestedPrice().listingPrice) — este
  // builder nunca calcula preço, só recebe o resultado já pronto.
  listingPriceBRL: number;
}

// Erro de CONFIGURAÇÃO (não da peça) — listing_type_id depende do plano de
// anúncio contratado pelo vendedor e nunca tem um "padrão razoável" seguro
// (ver ML_LISTING_TYPE_ID em lib/env.ts): publicar com o tipo errado tem
// custo real (exposição/tarifa diferentes).
export class MercadoLivrePublishConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MercadoLivrePublishConfigError";
  }
}

// Nunca monta payload parcial: toda checagem roda ANTES do primeiro campo
// do payload ser montado — qualquer falha lança antes de chegar a
// assemblePayload. Ordem deliberada (mais barato/menos dependente da peça
// primeiro): configuração do sistema -> sanidade do preço informado pelo
// chamador -> elegibilidade da peça -> categoria. Isso também é o que torna
// cada guarda testável isoladamente (ver tests/mercadoLivrePublisherPayload.test.ts):
// a categoria placeholder desta fase (ver categoryFixture.ts) SEMPRE
// bloqueia por último, nunca mascarando os outros três motivos de falha.
// Checagens compartilhadas por buildMercadoLivreItemPayload (modo real) e
// buildMercadoLivreItemPayloadPreview (modo dry-run, ver ajuste pós-etapa-5
// ponto A): config ausente, preço inválido e peça inelegível bloqueiam os
// DOIS modos — sem isso, o payload não teria conteúdo útil pra mostrar de
// qualquer forma. Só a prontidão de categoria/embalagem (assertReadyToPublish)
// é exclusiva do modo real, por isso NÃO mora aqui.
function prepareDraft(input: BuildMercadoLivreItemPayloadInput): MercadoLivreListingDraft {
  const { product, listingPriceBRL } = input;

  if (!env.ML_LISTING_TYPE_ID) {
    throw new MercadoLivrePublishConfigError(
      "ML_LISTING_TYPE_ID não configurado — defina o tipo de anúncio do plano contratado antes de publicar (ver .env.example)."
    );
  }

  if (!Number.isFinite(listingPriceBRL) || listingPriceBRL <= 0) {
    throw new ListingNotReadyError(`Preço de anúncio inválido (${listingPriceBRL}) — não é possível publicar.`);
  }

  const eligibility = validateListing(product);
  if (!eligibility.eligible) {
    throw new ListingNotReadyError(
      `Peça não apta para publicação no Mercado Livre: ${eligibility.blockers.map((blocker) => blocker.code).join(", ")}`
    );
  }

  return buildListingDraft(product);
}

export function buildMercadoLivreItemPayload(input: BuildMercadoLivreItemPayloadInput): MercadoLivreItemPayload {
  const draft = prepareDraft(input);

  // assertReadyToPublish lança ListingNotReadyError enquanto a categoria for
  // o placeholder não verificado (ver categoryFixture.ts) — hoje SEMPRE,
  // até a Fase que confirmar o id real via API autenticada. Exclusivo do
  // modo real — ver buildMercadoLivreItemPayloadPreview para o dry-run, que
  // NUNCA bloqueia por isso.
  assertReadyToPublish(draft);

  return assemblePayload(draft, input.product.sku, input.listingPriceBRL, env.ML_LISTING_TYPE_ID);
}

export interface MercadoLivrePublishPreview {
  payload: MercadoLivreItemPayload;
  // Mesmos códigos de getReadinessIssues (listingBuilder.ts) — lista vazia
  // quando a peça já estaria pronta pra publicação real também (categoria
  // confirmada e embalagem dentro da faixa).
  issues: ListingNotReadyCode[];
}

// Ajuste pós-etapa-5 (ponto A do cliente): dry-run deve SEMPRE devolver o
// payload completo pra revisão — mesmo hoje, com a categoria desta fase
// ainda não confirmada (ver categoryFixture.ts) — em vez de bloquear igual
// ao modo real. `issues` carrega os mesmos motivos que bloqueariam o modo
// real (getReadinessIssues), pra quem chama marcar a resposta como "prévia,
// não publicável" sempre que a lista não estiver vazia. Config ausente/
// preço inválido/peça inelegível (ver prepareDraft) continuam bloqueando os
// dois modos — sem isso o payload não teria conteúdo útil de qualquer forma.
export function buildMercadoLivreItemPayloadPreview(input: BuildMercadoLivreItemPayloadInput): MercadoLivrePublishPreview {
  const draft = prepareDraft(input);
  const issues = getReadinessIssues(draft);
  const payload = assemblePayload(draft, input.product.sku, input.listingPriceBRL, env.ML_LISTING_TYPE_ID);
  return { payload, issues };
}

// Montagem pura dos campos, separada das checagens acima de propósito: um
// MercadoLivreListingDraft com `category.verified: true` só existe de
// verdade numa fase futura (depois da categoria real confirmada) — para o
// FORMATO do payload (SKU, fotos como URL pública, listing_type_id vindo de
// configuração) já ter cobertura de teste agora, sem depender disso, os
// testes chamam esta função direto com um draft construído à mão.
export function assemblePayload(
  draft: MercadoLivreListingDraft,
  sku: string | null,
  listingPriceBRL: number,
  listingTypeId: string
): MercadoLivreItemPayload {
  return {
    title: draft.title,
    category_id: draft.category.id,
    price: listingPriceBRL,
    currency_id: "BRL",
    available_quantity: 1,
    buying_mode: "buy_it_now",
    listing_type_id: listingTypeId,
    condition: "new",
    // draft.photos já são URLs públicas do R2 (ver listingBuilder.ts/
    // ProductImage.url) — nunca uma referência de arquivo local.
    pictures: draft.photos.map((url) => ({ source: url })),
    ...(sku ? { seller_custom_field: sku } : {}),
    // packageBox.ok é sempre true quando chegamos aqui pelo fluxo real
    // (buildMercadoLivreItemPayload já chamou assertReadyToPublish, que
    // bloqueia antes). Omite `shipping` só no caso defensivo de alguém
    // chamar assemblePayload direto com um draft "ok: false" (ver testes) —
    // nunca inventa dimensões pra uma peça sem preset válido.
    ...(draft.packageBox.ok
      ? {
          shipping: {
            dimensions: `${draft.packageBox.box.lengthCm}x${draft.packageBox.box.widthCm}x${draft.packageBox.box.heightCm}cm,${draft.packageBox.packageWeightGrams}g`,
          },
        }
      : {}),
  };
}
