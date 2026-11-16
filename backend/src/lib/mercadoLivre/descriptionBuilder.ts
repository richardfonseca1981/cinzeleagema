import { env } from "../env";
import { resolveTitle, resolveBodyText, type CatalogProductContent } from "../catalog/content";
import { hasKnownMaterial } from "./titleGenerator";
import { sanitizeMercadoLivreDescriptionText } from "./descriptionSanitizer";

// Fase 1B etapa 3 — descrição ESTENDIDA do anúncio (texto puro, sem
// markdown/HTML), diferente da description curta do rascunho de simulação
// (listingBuilder.ts buildListingDraft, Fase 1A — corpo + disclosure só).
// Pensada para ser enviada separadamente via
// MercadoLivrePublisherClient.setItemDescription (publisherClient.ts),
// nunca dentro do payload de POST /items — o Mercado Livre expõe descrição
// por um endpoint próprio (SUPOSIÇÃO não verificada, ver publisherClient.ts).
export interface DescriptionBuilderInput extends CatalogProductContent {
  identificationTreatment: string | null;
  weightGrams: number;
  sizeCm: number;
}

// Texto de curadoria aprovado pelo Felipe para o catálogo do Mercado Livre
// — FIXO, em português, nunca editado por peça e nunca passa pelo
// sanitizador (só o corpo vindo do banco precisa de sanitização). Nunca
// afirma certificação/laudo (ver Product.identificationTreatment no
// schema: "triagem visual, NUNCA um laudo gemológico"). A nuance de "o
// exemplar das fotos é o que chega" é deliberadamente OPOSTA ao aviso
// legal geral do catálogo (CATALOG_LEGAL_NOTICE, pdfPages.ts — que avisa
// sobre variação entre peças parecidas em estoque): cada anúncio do
// Mercado Livre é uma peça única (available_quantity: 1, buying_mode
// buy_it_now, condition "new" — ver publisherPayload.ts), sem reposição.
export const ML_CURATION_TEXT =
  "O cristal apresentado nas imagens é exatamente o exemplar que chegará até você: esta é uma peça única, sem reposição por outra unidade semelhante. Pequenas variações de tom, brilho ou nitidez podem ocorrer por causa da iluminação usada na foto ou das configurações de cor e brilho da tela em que você está vendo este anúncio — nesses casos a pedra física pode parecer sutilmente diferente da imagem, sem que isso signifique troca de peça.";

const TREATMENT_DISCLOSURE: Record<string, string> = {
  TINGIDA: "Atenção: pedra tingida artificialmente (tratamento de cor).",
  POSSIVEL_TINGIMENTO: "Atenção: possível tingimento/tratamento de cor — triagem visual, sem laudo gemológico.",
};

function formatWeightLine(weightGrams: number): string | null {
  if (!(weightGrams > 0)) return null;
  if (weightGrams < 1000) return `Peso: ${Math.round(weightGrams)} g`;
  const kg = weightGrams / 1000;
  return `Peso: ${kg.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg`;
}

function formatSizeLine(sizeCm: number): string | null {
  if (!(sizeCm > 0)) return null;
  return `Tamanho: ${sizeCm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`;
}

// "Material" aqui nunca é o nome exato do mineral (já está no título, ver
// resolveTitle) — só confirma que o nome indica um material reconhecido
// (mesmo dicionário/critério de titleGenerator.ts hasKnownMaterial: "nunca
// inventa material que o nome não indica"). Sem correspondência no nome,
// a linha de material é omitida por completo.
function formatMaterialLine(name: string | null): string | null {
  if (!name || !hasKnownMaterial(name)) return null;
  return "Material: pedra natural";
}

function buildSpecsLine(input: DescriptionBuilderInput): string | null {
  const parts = [formatWeightLine(input.weightGrams), formatSizeLine(input.sizeCm), formatMaterialLine(input.name)].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

// Nunca corta no meio de uma palavra (mesmo critério de truncateTitle, ver
// listingBuilder.ts) — procura o último espaço que cabe antes do limite;
// sem espaço algum na janela (texto gigante de uma palavra só), corta duro.
function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars - 1);
  const lastBreak = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"));
  const cut = lastBreak > 0 ? slice.slice(0, lastBreak) : slice;
  return `${cut.trimEnd()}…`;
}

// Monta a descrição estendida: curadoria fixa -> peso/dimensão/material ->
// corpo existente (resolveBodyText, sanitizado) quando houver -> disclosure
// de tratamento existente. Texto puro: parágrafos separados por linha em
// branco (`\n\n`), nunca markdown. `title` é só para resolveBodyText saber
// remover o nome repetido do início do corpo (ver content.ts) — não entra
// na descrição (o Mercado Livre já mostra o título do anúncio separado).
export function buildMercadoLivreDescription(input: DescriptionBuilderInput): string {
  const title = resolveTitle(input, "pt");
  const specsLine = buildSpecsLine(input);
  const body = resolveBodyText(input, "pt", title);
  const sanitizedBody = body ? sanitizeMercadoLivreDescriptionText(body.text) : null;
  const disclosure = input.identificationTreatment ? TREATMENT_DISCLOSURE[input.identificationTreatment] : null;

  const parts = [ML_CURATION_TEXT, specsLine, sanitizedBody, disclosure].filter(
    (part): part is string => Boolean(part?.trim())
  );
  const full = parts.join("\n\n");

  return truncateAtWordBoundary(full, env.ML_DESCRIPTION_MAX_CHARS);
}
