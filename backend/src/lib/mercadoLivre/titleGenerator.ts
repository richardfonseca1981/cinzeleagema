import { resolveTitle } from "../catalog/content";
import { formatWeightLabel } from "../catalog/pdfPages";
import { validateListing, ML_TITLE_MAX_CHARS, type ListingValidationInput } from "./listingValidator";

// Gerador de sugestões de título para anúncio do Mercado Livre (Fase 1A —
// só sugestão para o Felipe aprovar manualmente; NENHUMA chamada à API do
// ML, nunca grava nada no banco). Reaproveita resolveTitle (lib/catalog/
// content.ts) em vez de reimplementar a resolução de nome, e validateListing
// (listingValidator.ts) para "peça apta" usar a MESMA regra do resto da Fase
// 1A — inclusive o caso de nome provisório: validateListing já chama
// isPlaceholderTitle internamente (via resolveTitle) e bloqueia a peça
// (blocker "placeholder_title") ANTES de chegar aqui, então uma peça com
// nome provisório nunca passa pelo `if (!eligibility.eligible)` abaixo —
// checar isPlaceholderTitle de novo neste arquivo seria código morto
// (inalcançável por construção, já que os dois chamam resolveTitle com os
// mesmos argumentos). Os códigos dos blockers entram na mensagem do aviso
// "ineligible" abaixo, para o motivo real aparecer no CSV.
export interface TitleGenerationInput extends ListingValidationInput {
  categoryName: string | null;
}

export type TitleWarningCode =
  | "ineligible"
  | "variants_equal"
  | "title_a_hard_truncated"
  | "title_b_hard_truncated"
  | "duplicate_title_a"
  | "duplicate_title_b";

export interface TitleWarningIssue {
  code: TitleWarningCode;
  message: string;
}

export interface TitleSuggestionRow {
  id: string;
  sku: string | null;
  currentName: string;
  titleA: string | null;
  titleB: string | null;
  titleALength: number | null;
  titleBLength: number | null;
  warnings: TitleWarningIssue[];
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Sanitização de texto (regras literais do pedido: sem caixa alta, sem
// aspas, sem ponto final, sem espaços duplos, sem parênteses repetidos, sem
// termos promocionais/de preço, sem o nome da loja).
// ---------------------------------------------------------------------------

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Aspas retas (ASCII, seguras de digitar) + aspas curvas/guillemets via
// escape \uXXXX explícito (nunca o caractere literal no source — o mesmo
// problema do BOM em auditMercadoLivre.ts: um caractere "smart quote"
// colado direto no editor pode virar silenciosamente uma aspa reta
// duplicada em vez do caractere pretendido, e o regex perde o match real).
// U+201C/201D "aspas duplas curvas", U+2018/2019 'aspas simples curvas',
// U+00AB/00BB «guillemets».
const CURLY_QUOTE_CHARS = [0x201c, 0x201d, 0x2018, 0x2019, 0x00ab, 0x00bb].map((code) => String.fromCharCode(code)).join("");
const QUOTE_CHARS = new RegExp(`["'${CURLY_QUOTE_CHARS}]`, "g");
function stripQuotes(text: string): string {
  return text.replace(QUOTE_CHARS, "");
}

// "(38x20x14 cm))" -> "(38x20x14 cm)" — colapsa CADA run de 2+ parênteses do
// mesmo tipo (abre ou fecha) em um só; não tenta detectar grupos
// parentéticos duplicados com conteúdo diferente (fora do escopo pedido).
function collapseDuplicateParens(text: string): string {
  return text.replace(/\({2,}/g, "(").replace(/\){2,}/g, ")");
}

function stripTrailingPeriods(text: string): string {
  return text.trim().replace(/\.+$/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Termos promocionais/de preço e o nome da loja NUNCA entram num título
// gerado por este módulo (o vocabulário que ele mesmo usa — "Natural",
// categoria, tamanho, peso — nunca inclui nenhum deles) — esta lista é uma
// proteção defensiva contra o `name` cadastrado já trazer algum por engano.
const BANNED_TERMS = [
  "oferta",
  "ofertas",
  "barato",
  "barata",
  "baratos",
  "baratas",
  "frete gratis",
  "frete grátis",
  "promocao",
  "promoção",
  "desconto",
  "liquidacao",
  "liquidação",
  "imperdivel",
  "imperdível",
  "cinzel e a gema",
  "o cinzel e a gema",
  "cinzel",
];

function stripBannedTerms(text: string): string {
  let result = text;
  for (const term of BANNED_TERMS) {
    const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    result = result.replace(re, "");
  }
  return normalizeSpaces(result);
}

// "sem caixa alta": só reescreve quando o texto inteiro está em maiúsculas
// (ex.: "AMETISTA URUGUAIA" digitado assim no cadastro) — um nome já em
// mixed case normal (ex.: "Ametista Uruguaia") não é tocado, para não
// arriscar descapitalizar uma grafia proposital.
function fixAllCaps(text: string): string {
  const lettersOnly = text.replace(/[^\p{L}]/gu, "");
  if (lettersOnly.length < 2 || lettersOnly !== lettersOnly.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_match, boundary: string, letter: string) => boundary + letter.toUpperCase());
}

export function sanitizeTitleText(text: string): string {
  let result = text;
  result = stripQuotes(result);
  result = collapseDuplicateParens(result);
  result = stripTrailingPeriods(result);
  result = stripBannedTerms(result);
  result = fixAllCaps(result);
  return normalizeSpaces(result);
}

// ---------------------------------------------------------------------------
// Material (para decidir se "natural" faz sentido) — dicionário de pedras/
// minerais comuns no catálogo; sem correspondência, "natural" não é usado
// (nunca inventa material que o nome não indica).
// ---------------------------------------------------------------------------

const KNOWN_MATERIALS = [
  "ametista",
  "agata",
  "quartzo",
  "esmeralda",
  "topazio",
  "turmalina",
  "citrino",
  "granada",
  "safira",
  "rubi",
  "opala",
  "jade",
  "obsidiana",
  "selenita",
  "drusa",
  "geodo",
  "ametrino",
  "fluorita",
  "calcita",
  "pirita",
  "malaquita",
  "turquesa",
  "lapis lazuli",
  "howlita",
  "jaspe",
  "sodalita",
  "labradorita",
  "aventurina",
  "rodocrosita",
  "hematita",
  "cristal de rocha",
];

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function hasKnownMaterial(name: string): boolean {
  const normalized = normalizeForMatch(name);
  return KNOWN_MATERIALS.some((material) => normalized.includes(material));
}

// ---------------------------------------------------------------------------
// Tamanho (cm) — mesma convenção pt-BR do catálogo em PDF (ver
// pdfPages.ts formatSizeLabel, não exportado — reescrito aqui, 1 linha).
// ---------------------------------------------------------------------------

function formatSizeCmLabel(sizeCm: number): string {
  const formatted = sizeCm.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${formatted}cm`;
}

// ---------------------------------------------------------------------------
// Montagem do título com limite de 60 chars: nunca corta palavra no meio.
// Partes "removíveis" (adjetivos — "Natural", prefixo de categoria) somem
// primeiro, em ordem de prioridade; o tamanho só some depois; o nome nunca
// é removido. Se mesmo sem nenhuma parte removível o nome sozinho passar do
// limite, trunca no último espaço que cabe (nunca no meio de uma palavra).
// ---------------------------------------------------------------------------

interface TitlePart {
  text: string;
  removable: boolean;
  removalPriority: number;
}

function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  // Sem espaço algum na janela: uma única "palavra" maior que o limite —
  // caso extremo sem alternativa (nunca ocorre com nomes reais de pedra).
  if (lastSpace <= 0) return slice;
  return slice.slice(0, lastSpace).trimEnd();
}

function assembleTitle(parts: TitlePart[], maxChars: number): { text: string; hardTruncated: boolean } {
  let current = parts.filter((part) => part.text.length > 0);
  const join = (list: TitlePart[]) => normalizeSpaces(list.map((part) => part.text).join(" "));

  let text = join(current);
  while (text.length > maxChars) {
    const removable = current.filter((part) => part.removable);
    if (removable.length === 0) break;
    const toRemove = removable.reduce((lowest, part) => (part.removalPriority < lowest.removalPriority ? part : lowest));
    current = current.filter((part) => part !== toRemove);
    text = join(current);
  }

  if (text.length <= maxChars) return { text, hardTruncated: false };
  return { text: truncateAtWordBoundary(text, maxChars), hardTruncated: true };
}

// ---------------------------------------------------------------------------
// Duas variações por peça, estruturalmente diferentes uma da outra (ordem/
// conteúdo), para já ajudar a diferenciar peças com o mesmo nome cadastrado
// mesmo antes do passo de desduplicação entre peças (ver
// differentiateDuplicates abaixo).
// ---------------------------------------------------------------------------

function buildVariantA(cleanName: string, sizeLabel: string | null, natural: boolean): TitlePart[] {
  return [
    { text: cleanName, removable: false, removalPriority: 99 },
    { text: natural ? "Natural" : "", removable: true, removalPriority: 1 },
    { text: sizeLabel ?? "", removable: true, removalPriority: 2 },
  ];
}

function buildVariantB(cleanName: string, sizeLabel: string | null, categoryName: string | null, weightLabel: string | null): TitlePart[] {
  if (categoryName) {
    return [
      { text: categoryName, removable: true, removalPriority: 1 },
      { text: cleanName, removable: false, removalPriority: 99 },
      { text: sizeLabel ?? "", removable: true, removalPriority: 2 },
    ];
  }
  // Sem categoria disponível: usa o peso (quando houver) como diferencial
  // estrutural de B em vez do prefixo de categoria — ainda assim distinto
  // de A (que nunca inclui peso).
  return [
    { text: cleanName, removable: false, removalPriority: 99 },
    { text: sizeLabel ?? "", removable: true, removalPriority: 2 },
    { text: weightLabel ?? "", removable: true, removalPriority: 1 },
  ];
}

// ---------------------------------------------------------------------------
// Desduplicação entre peças: peças com título A (ou B) IDÊNTICO a outra
// peça tentam se diferenciar acrescentando o peso ao final (só se couber no
// limite de 60 e o peso ainda não estiver no texto); se mesmo assim duas ou
// mais continuarem idênticas, falha com aviso — mantém a primeira, zera o
// título das demais (nunca emite duplicado silenciosamente).
// ---------------------------------------------------------------------------

function appendWeightIfPossible(title: string, weightLabel: string | null, maxChars: number): { text: string; appended: boolean } {
  if (!weightLabel) return { text: title, appended: false };
  if (normalizeForMatch(title).includes(normalizeForMatch(weightLabel))) return { text: title, appended: false };
  const candidate = normalizeSpaces(`${title} ${weightLabel}`);
  if (candidate.length > maxChars) return { text: title, appended: false };
  return { text: candidate, appended: true };
}

function differentiateDuplicates(
  rows: TitleSuggestionRow[],
  weightLabels: Map<string, string | null>,
  field: "titleA" | "titleB",
  lengthField: "titleALength" | "titleBLength",
  duplicateWarningCode: TitleWarningCode
): void {
  const groups = new Map<string, TitleSuggestionRow[]>();
  for (const row of rows) {
    const value = row[field];
    if (!value) continue;
    const key = normalizeForMatch(value);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const attempts = group.map((row) => {
      const current = row[field] as string;
      const { text, appended } = appendWeightIfPossible(current, weightLabels.get(row.id) ?? null, ML_TITLE_MAX_CHARS);
      return { row, text, appended };
    });

    const afterGroups = new Map<string, typeof attempts>();
    for (const attempt of attempts) {
      const key = normalizeForMatch(attempt.text);
      const bucket = afterGroups.get(key) ?? [];
      bucket.push(attempt);
      afterGroups.set(key, bucket);
    }

    for (const bucket of afterGroups.values()) {
      if (bucket.length < 2) {
        // Diferenciado com sucesso (ou já era único) — grava o texto final.
        const [attempt] = bucket;
        attempt.row[field] = attempt.text;
        attempt.row[lengthField] = attempt.text.length;
        continue;
      }
      // Ainda colide mesmo depois de tentar o peso: mantém a primeira
      // ocorrência do grupo, zera as demais com aviso — nunca duplicado
      // silencioso.
      bucket.forEach((attempt, index) => {
        if (index === 0) {
          attempt.row[field] = attempt.text;
          attempt.row[lengthField] = attempt.text.length;
          return;
        }
        attempt.row[field] = null;
        attempt.row[lengthField] = null;
        attempt.row.warnings.push({
          code: duplicateWarningCode,
          message: "Título duplicado com outra peça do catálogo mesmo após tentar diferenciar pelo peso — revisar manualmente.",
        });
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Geração por peça (passo 1) + desduplicação entre peças (passo 2, só faz
// sentido com o lote inteiro em mãos — por isso a função recebe um array).
// ---------------------------------------------------------------------------

export function generateTitleSuggestions(products: TitleGenerationInput[]): TitleSuggestionRow[] {
  const rows: TitleSuggestionRow[] = [];
  const weightLabels = new Map<string, string | null>();

  for (const product of products) {
    const currentName = resolveTitle(product, "pt");
    const row: TitleSuggestionRow = {
      id: product.id,
      sku: product.sku,
      currentName,
      titleA: null,
      titleB: null,
      titleALength: null,
      titleBLength: null,
      warnings: [],
    };
    rows.push(row);

    const eligibility = validateListing(product);
    if (!eligibility.eligible) {
      const reasons = eligibility.blockers.map((blocker) => blocker.code).join(", ");
      row.warnings.push({ code: "ineligible", message: `Peça não apta para anúncio (${reasons}) — nenhuma sugestão gerada.` });
      continue;
    }

    const cleanName = sanitizeTitleText(currentName);
    const sizeCm = toNumberOrNull(product.sizeCm) ?? 0;
    const sizeLabel = sizeCm > 0 ? formatSizeCmLabel(sizeCm) : null;
    const weightGrams = toNumberOrNull(product.weightGrams) ?? 0;
    const weightLabel = weightGrams > 0 ? formatWeightLabel(weightGrams, "pt") : null;
    weightLabels.set(product.id, weightLabel);
    const natural = hasKnownMaterial(cleanName);
    const categoryName = product.categoryName ? sanitizeTitleText(product.categoryName) : null;

    const variantA = assembleTitle(buildVariantA(cleanName, sizeLabel, natural), ML_TITLE_MAX_CHARS);
    const variantB = assembleTitle(buildVariantB(cleanName, sizeLabel, categoryName, weightLabel), ML_TITLE_MAX_CHARS);

    row.titleA = variantA.text;
    row.titleALength = variantA.text.length;
    if (variantA.hardTruncated) {
      row.warnings.push({ code: "title_a_hard_truncated", message: "Título A precisou truncar o próprio nome (não coube nem sem os adjetivos)." });
    }

    if (normalizeForMatch(variantB.text) === normalizeForMatch(variantA.text)) {
      // Peça sem material reconhecido, sem categoria e sem peso: nada
      // sobrou pra diferenciar B de A — falha com aviso em vez de emitir
      // duas sugestões idênticas.
      row.warnings.push({ code: "variants_equal", message: "Não foi possível diferenciar a variação B da A (sem material, categoria ou peso disponível) — título B não gerado." });
    } else {
      row.titleB = variantB.text;
      row.titleBLength = variantB.text.length;
      if (variantB.hardTruncated) {
        row.warnings.push({ code: "title_b_hard_truncated", message: "Título B precisou truncar o próprio nome (não coube nem sem os adjetivos)." });
      }
    }
  }

  differentiateDuplicates(rows, weightLabels, "titleA", "titleALength", "duplicate_title_a");
  differentiateDuplicates(rows, weightLabels, "titleB", "titleBLength", "duplicate_title_b");

  return rows;
}
