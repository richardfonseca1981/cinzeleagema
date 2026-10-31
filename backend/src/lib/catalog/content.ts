export type CatalogLanguage = "pt" | "en";

export interface CatalogProductContent {
  name: string | null;
  sku: string | null;
  description: string | null;
  descriptionEn: string | null;
  identificationPt: string | null;
  identificationEn: string | null;
  nameEn: string | null;
}

const UNNAMED_LABEL: Record<CatalogLanguage, string> = {
  pt: "Peça sem nome",
  en: "Unnamed piece",
};

// Mesma convenção de localização do site público (ver
// frontend/src/lib/format.ts localizeText): em EN usa a tradução quando ela
// existe e cai para o texto em PT quando não existe, em vez de mostrar vazio.
function localize(pt: string | null, en: string | null, language: CatalogLanguage): string | null {
  const ptTrimmed = pt?.trim() || null;
  if (language === "en" && en?.trim()) return en.trim();
  return ptTrimmed;
}

// Título = identificação de catálogo por IA (quando existir, numa peça só
// entra se tiver sido confirmada pelo admin) -> nome cadastrado -> SKU ->
// texto fixo "Peça sem nome"/"Unnamed piece". Identificação e nome são
// tratados como DOIS pares bilíngues independentes (localize cuida da
// tradução dentro de cada par) — um título por identificação parcial (só PT
// cadastrado, por exemplo) ainda é preferível a pular direto para o nome.
export function resolveTitle(product: CatalogProductContent, language: CatalogLanguage): string {
  const identification = localize(product.identificationPt, product.identificationEn, language);
  if (identification) return identification;

  const name = localize(product.name, product.nameEn, language);
  if (name) return name;

  if (product.sku?.trim()) return product.sku.trim();

  return UNNAMED_LABEL[language];
}

export interface CatalogBodyText {
  text: string;
  // "identification": texto curto da IA (mesmo usado no título, se
  // presente) — tratado com mais espaço/sem corte agressivo (ver layout.ts
  // DESCRIPTION_MAX_HEIGHT_IDENTIFICATION). "description": descrição
  // própria da peça cadastrada (o aviso legal genérico nunca entra aqui —
  // ver isGenericLegalNotice).
  source: "identification" | "description";
}

const DIACRITIC_MARKS = new RegExp("[̀-ͯ]", "g");

function normalizeForPrefixMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITIC_MARKS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Muitas peças (sobretudo as de importação em lote) têm, no campo
// `description`, só o aviso legal genérico de pedra natural — o MESMO texto
// completo que agora vive na página de contato (ver pdfPages.ts
// CATALOG_LEGAL_NOTICE). Mostrar esse aviso de novo, truncado, em toda
// página de peça é repetitivo — por isso é tratado como "sem descrição
// própria" aqui, não como uma description de verdade. Comparação por
// PREFIXO normalizado (sem acento/maiúscula) para não depender de
// pontuação exata.
const GENERIC_NOTICE_PREFIXES = ["por se tratar de um produto natural", "as a natural product"];

export function isGenericLegalNotice(text: string): boolean {
  const normalized = normalizeForPrefixMatch(text);
  return GENERIC_NOTICE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

// Corpo de texto da página da peça (AJUSTES VISUAIS, 2ª rodada, item 3):
// 1) identificação de catálogo por IA quando existir (mesmo texto do
//    título — curto e específico da peça);
// 2) senão, a description cadastrada — MAS só se não for o aviso legal
//    genérico (nesse caso a peça não mostra descrição nenhuma na própria
//    página; o aviso completo mora só na página de contato);
// 3) senão, nada.
// Texto vindo do banco é DADO puro — nenhuma interpretação de markup aqui.
export function resolveBodyText(product: CatalogProductContent, language: CatalogLanguage): CatalogBodyText | null {
  const identification = localize(product.identificationPt, product.identificationEn, language);
  if (identification) return { text: identification, source: "identification" };

  const description = language === "en" ? product.descriptionEn?.trim() || product.description?.trim() : product.description?.trim();
  if (description && !isGenericLegalNotice(description)) return { text: description, source: "description" };

  return null;
}

// Nome provisório de importação em lote ("Pedra 1234 - Peso" / "Stone 1234 -
// Weight") — a peça ainda não recebeu um nome de catálogo de verdade. O
// título continua sendo exibido normalmente (ver resolveTitle); isto só
// sinaliza a peça em `warnings` (ver generateCatalogPdf) para o admin saber
// que precisa revisar, sem bloquear a geração do catálogo.
const PLACEHOLDER_TITLE_PATTERN = /^(pedra|stone)\s+\d+\s*-\s*(peso|weight)$/i;

export function isPlaceholderTitle(title: string): boolean {
  return PLACEHOLDER_TITLE_PATTERN.test(title.trim());
}
