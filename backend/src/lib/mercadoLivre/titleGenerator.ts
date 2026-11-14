import { resolveTitle } from "../catalog/content";
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
//
// Ajustado após a rodada real de produção (ver CONTEXT.md): sem "Natural"
// duplicado, variação B sem o nome de categoria interno, truncamento que
// nunca termina em conectivo nem soma tamanho redundante quando o nome já
// tem dimensões, e diferenciação por peso de verdade (inclusive peças de
// mesmo nome com tamanho a até 1cm de distância).
// Não leva mais categoria (ver buildVariantParts/pickVariantBSearchTerm): a
// categoria interna do catálogo (ex.: "Formas", "Homedecor") nunca foi um
// termo de busca útil pro comprador — removida da variação B a pedido do
// Felipe, trocada por "Pedra Natural"/"Peça Única". Fica como alias do tipo
// do validador (em vez de reexportar o mesmo formato por extends vazio) —
// contrato público estável mesmo que listingValidator mude no futuro.
export type TitleGenerationInput = ListingValidationInput;

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
// String.fromCharCode explícito (nunca o caractere literal no source — o
// mesmo problema do BOM em auditMercadoLivre.ts: um caractere "smart quote"
// colado direto no editor pode virar silenciosamente outra coisa, e o regex
// perde o match real — já aconteceu numa rodada anterior deste arquivo).
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
// "Pedra Natural", "Peça Única", tamanho, peso — nunca inclui nenhum deles)
// — esta lista é uma proteção defensiva contra o `name` cadastrado já
// trazer algum por engano.
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
// Dimensões embutidas no nome ("(38x20x14 cm)") — extraídas do núcleo do
// nome pra virarem uma parte REMOVÍVEL própria (ver TitlePart abaixo, regra
// 3: "preferir remover o trecho entre parênteses" antes de truncar palavra).
// Quando o nome já tem esse trecho, o tamanho (sizeCm) NÃO é somado de novo
// como sufixo — evita "Geodo (38x20x14 cm) 23cm" redundante.
// ---------------------------------------------------------------------------

const EMBEDDED_DIMENSIONS_PATTERN = /\(\s*\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?\s*cm\s*\)/i;

function extractEmbeddedDimensions(cleanName: string): { core: string; dims: string | null } {
  const match = cleanName.match(EMBEDDED_DIMENSIONS_PATTERN);
  if (!match) return { core: cleanName, dims: null };
  const core = normalizeSpaces(cleanName.replace(match[0], ""));
  return { core, dims: match[0] };
}

// ---------------------------------------------------------------------------
// Material (para decidir se "Natural"/"Pedra Natural" faz sentido) —
// dicionário de pedras/minerais comuns no catálogo; sem correspondência,
// nenhuma das duas é usada (nunca inventa material que o nome não indica).
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

// Checa a PALAVRA inteira (nunca substring solta) em qualquer posição,
// ignorando maiúsculas/acentos — usada pra nunca duplicar "natural"/"única"
// quando o nome cadastrado já traz a palavra (regra 1 do ajuste pós-produção).
function containsWord(text: string, word: string): boolean {
  const normalized = normalizeForMatch(text);
  const re = new RegExp(`\\b${escapeRegExp(normalizeForMatch(word))}\\b`);
  return re.test(normalized);
}

// ---------------------------------------------------------------------------
// Tamanho (cm) e peso — rótulos próprios deste módulo. Peso usa um formato
// compacto ("540g"/"1kg", sem espaço) diferente do formatWeightLabel do
// catálogo em PDF ("850 g"/"1,2 kg") — pedido explicitamente neste formato
// pra diferenciação de título, mais curto (cabe mais vezes no limite de 60).
// ---------------------------------------------------------------------------

function formatSizeCmLabel(sizeCm: number): string {
  const formatted = sizeCm.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${formatted}cm`;
}

function formatWeightCompactLabel(weightGrams: number): string {
  if (weightGrams < 1000) return `${Math.round(weightGrams)}g`;
  const kg = Math.round((weightGrams / 1000) * 10) / 10;
  const formatted = kg % 1 === 0 ? String(kg) : kg.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${formatted}kg`;
}

// ---------------------------------------------------------------------------
// Montagem do título com limite de 60 chars: nunca corta palavra no meio,
// nunca termina em conectivo. Partes "removíveis" somem primeiro, em ordem
// de prioridade (dimensões embutidas > adjetivo/termo de busca > tamanho >
// peso de diferenciação); o núcleo do nome nunca é removido. Se mesmo sem
// nenhuma parte removível o núcleo sozinho passar do limite, trunca no
// último espaço que cabe (nunca no meio de uma palavra) — e, nos dois
// casos, remove conectivo(s) soltos que sobrarem no fim.
// ---------------------------------------------------------------------------

interface TitlePart {
  text: string;
  removable: boolean;
  removalPriority: number;
}

// Nunca termina em conectivo isolado (e, de, do, da, com, em, na, no, a, o,
// para) — regra 3 do ajuste pós-produção. Remove um ou mais, da direita pra
// esquerda, sem nunca esvaziar o texto por completo.
const TRAILING_CONNECTIVES = new Set(["e", "de", "do", "da", "com", "em", "na", "no", "a", "o", "para"]);

function stripTrailingConnectives(text: string): string {
  const words = text.split(" ");
  while (words.length > 1 && TRAILING_CONNECTIVES.has(normalizeForMatch(words[words.length - 1]))) {
    words.pop();
  }
  return words.join(" ").trim();
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

  if (text.length <= maxChars) return { text: stripTrailingConnectives(text), hardTruncated: false };
  return { text: stripTrailingConnectives(truncateAtWordBoundary(text, maxChars)), hardTruncated: true };
}

// ---------------------------------------------------------------------------
// Duas variações por peça, estruturalmente diferentes uma da outra. B não
// leva mais o nome de categoria interno (ex.: "Formas", "Homedecor" — não
// são termos de busca úteis pro comprador) — usa, no lugar, "Pedra Natural"
// (quando há material reconhecido e o nome ainda não diz "natural") ou
// "Peça Única" (quando o nome ainda não diz "única"/"único") como termo de
// busca; sem nenhum dos dois disponível, B fica só com núcleo + dimensões/
// tamanho/peso, igual A — nesse caso `variants_equal` pega a colisão e B
// não é gerado (ver generateTitleSuggestions).
// ---------------------------------------------------------------------------

function pickVariantBSearchTerm(cleanName: string, naturalMakesSense: boolean): string | null {
  if (naturalMakesSense) return "Pedra Natural";
  if (!containsWord(cleanName, "unica") && !containsWord(cleanName, "unico")) return "Peça Única";
  return null;
}

function buildVariantParts(options: {
  core: string;
  dims: string | null;
  sizeLabel: string | null;
  weightLabel: string | null;
  prefix: string | null;
  suffix: string | null;
}): TitlePart[] {
  const parts: TitlePart[] = [];
  if (options.prefix) parts.push({ text: options.prefix, removable: true, removalPriority: 1 });
  parts.push({ text: options.core, removable: false, removalPriority: 99 });
  if (options.dims) parts.push({ text: options.dims, removable: true, removalPriority: 0 });
  if (options.suffix) parts.push({ text: options.suffix, removable: true, removalPriority: 1 });
  parts.push({ text: options.sizeLabel ?? "", removable: true, removalPriority: 2 });
  parts.push({ text: options.weightLabel ?? "", removable: true, removalPriority: 3 });
  return parts;
}

// ---------------------------------------------------------------------------
// Diferenciação por peso entre peças de MESMO NOME com tamanho igual ou a
// até 1cm de distância (regra 4 do ajuste pós-produção — antes o peso só
// era tentado como um simples acréscimo de última hora no texto já pronto,
// e silenciosamente desistia se não coubesse; agora entra como parte
// legítima do título, deslocando outras partes removíveis pra abrir espaço,
// igual qualquer outra parte de assembleTitle).
// ---------------------------------------------------------------------------

interface PreparedProduct {
  id: string;
  core: string;
  dims: string | null;
  sizeCm: number;
  sizeLabel: string | null;
  weightGrams: number;
  weightLabel: string | null;
  naturalMakesSense: boolean;
}

const SIZE_PROXIMITY_THRESHOLD_CM = 1;

function computeNeedsWeightDifferentiation(products: PreparedProduct[]): Set<string> {
  const byCoreName = new Map<string, PreparedProduct[]>();
  for (const product of products) {
    const key = normalizeForMatch(product.core);
    const group = byCoreName.get(key) ?? [];
    group.push(product);
    byCoreName.set(key, group);
  }

  const needsWeight = new Set<string>();
  for (const group of byCoreName.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (Math.abs(group[i].sizeCm - group[j].sizeCm) <= SIZE_PROXIMITY_THRESHOLD_CM) {
          needsWeight.add(group[i].id);
          needsWeight.add(group[j].id);
        }
      }
    }
  }
  return needsWeight;
}

// Rede de segurança final: depois de tudo (inclusive a diferenciação por
// peso acima), se DUAS OU MAIS peças ainda chegarem ao mesmo texto final
// (nomes diferentes que colapsaram pro mesmo título truncado, por exemplo),
// tenta acrescentar o peso uma última vez; se mesmo assim colidir, falha
// com aviso e esvazia o título das excedentes — nunca duplicado silencioso.
function resolveResidualCollisions(
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
      const weightLabel = weightLabels.get(row.id) ?? null;
      if (!weightLabel || normalizeForMatch(current).includes(normalizeForMatch(weightLabel))) {
        return { row, text: current };
      }
      const candidate = normalizeSpaces(`${current} ${weightLabel}`);
      return { row, text: candidate.length <= ML_TITLE_MAX_CHARS ? candidate : current };
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
        const [attempt] = bucket;
        attempt.row[field] = attempt.text;
        attempt.row[lengthField] = attempt.text.length;
        continue;
      }
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
// Geração: passo 1 prepara dados puros de cada peça apta (sem montar título
// ainda); passo 2 decide, com o lote inteiro em mãos, quais peças precisam
// do peso pra se diferenciar (regra 4); passo 3 monta A/B peça a peça;
// passo 4 roda a rede de segurança final.
// ---------------------------------------------------------------------------

export function generateTitleSuggestions(products: TitleGenerationInput[]): TitleSuggestionRow[] {
  const rows: TitleSuggestionRow[] = [];
  const rowById = new Map<string, TitleSuggestionRow>();
  const prepared: PreparedProduct[] = [];
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
    rowById.set(product.id, row);

    const eligibility = validateListing(product);
    if (!eligibility.eligible) {
      const reasons = eligibility.blockers.map((blocker) => blocker.code).join(", ");
      row.warnings.push({ code: "ineligible", message: `Peça não apta para anúncio (${reasons}) — nenhuma sugestão gerada.` });
      continue;
    }

    const cleanName = sanitizeTitleText(currentName);
    const { core, dims } = extractEmbeddedDimensions(cleanName);
    const sizeCm = toNumberOrNull(product.sizeCm) ?? 0;
    // Nome já traz dimensões embutidas: não soma o "Ncm" de novo (regra 3).
    const sizeLabel = !dims && sizeCm > 0 ? formatSizeCmLabel(sizeCm) : null;
    const weightGrams = toNumberOrNull(product.weightGrams) ?? 0;
    const weightLabel = weightGrams > 0 ? formatWeightCompactLabel(weightGrams) : null;
    weightLabels.set(product.id, weightLabel);
    // "Natural" só faz sentido com material reconhecido E o nome ainda não
    // disser "natural" em lugar nenhum (regra 1 — nunca duplica a palavra).
    const naturalMakesSense = hasKnownMaterial(cleanName) && !containsWord(cleanName, "natural");

    prepared.push({ id: product.id, core, dims, sizeCm, sizeLabel, weightGrams, weightLabel, naturalMakesSense });
  }

  const needsWeight = computeNeedsWeightDifferentiation(prepared);

  for (const item of prepared) {
    const row = rowById.get(item.id)!;
    const cleanName = item.dims ? `${item.core} ${item.dims}` : item.core; // só pra pickVariantBSearchTerm checar "única"/"unico" no texto completo
    const weightPart = needsWeight.has(item.id) ? item.weightLabel : null;

    const variantA = assembleTitle(
      buildVariantParts({
        core: item.core,
        dims: item.dims,
        sizeLabel: item.sizeLabel,
        weightLabel: weightPart,
        prefix: null,
        suffix: item.naturalMakesSense ? "Natural" : null,
      }),
      ML_TITLE_MAX_CHARS
    );

    const searchTerm = pickVariantBSearchTerm(cleanName, item.naturalMakesSense);
    const variantB = assembleTitle(
      buildVariantParts({
        core: item.core,
        dims: item.dims,
        sizeLabel: item.sizeLabel,
        weightLabel: weightPart,
        prefix: searchTerm,
        suffix: null,
      }),
      ML_TITLE_MAX_CHARS
    );

    row.titleA = variantA.text;
    row.titleALength = variantA.text.length;
    if (variantA.hardTruncated) {
      row.warnings.push({ code: "title_a_hard_truncated", message: "Título A precisou truncar o próprio nome (não coube nem sem as partes opcionais)." });
    }

    if (normalizeForMatch(variantB.text) === normalizeForMatch(variantA.text)) {
      // Sem termo de busca disponível (nome já diz "natural"/"única") e sem
      // diferença de peso/tamanho: nada sobrou pra diferenciar B de A —
      // falha com aviso em vez de emitir duas sugestões idênticas.
      row.warnings.push({
        code: "variants_equal",
        message: "Não foi possível diferenciar a variação B da A (sem termo de busca, tamanho ou peso disponível) — título B não gerado.",
      });
    } else {
      row.titleB = variantB.text;
      row.titleBLength = variantB.text.length;
      if (variantB.hardTruncated) {
        row.warnings.push({ code: "title_b_hard_truncated", message: "Título B precisou truncar o próprio nome (não coube nem sem as partes opcionais)." });
      }
    }
  }

  resolveResidualCollisions(rows, weightLabels, "titleA", "titleALength", "duplicate_title_a");
  resolveResidualCollisions(rows, weightLabels, "titleB", "titleBLength", "duplicate_title_b");

  return rows;
}
