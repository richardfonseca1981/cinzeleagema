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

// Título = SEMPRE o nome cadastrado da peça (ver REVISÃO FINAL item 2 —
// mudança deliberada: a identificação por IA deixou de ser fonte de
// título), COM UMA EXCEÇÃO: nome ainda placeholder de importação em lote
// (ver isPlaceholderTitle) + identificação title-like (ver
// isTitleLikeIdentification) disponível — nesse caso específico a peça
// ainda não tem nome de catálogo de verdade, então a identificação (um nome
// sugerido, não uma descrição) é um título melhor que "Pedra 1234 - Peso".
// Com nome placeholder mas SEM identificação title-like, cai para o nome
// placeholder mesmo (continua sinalizado em `warnings`, ver
// generateCatalogPdf). -> SKU -> texto fixo "Peça sem nome"/"Unnamed piece".
//
// dedupeRepeatedName (ver AJUSTES A4/CATÁLOGO item 5) é aplicado ao
// resultado final — limpeza defensiva contra o nome vindo duplicado do
// cadastro (ex.: "Ágata Azul Ágata Azul", "Ágata Azul - Ágata Azul").
export function resolveTitle(product: CatalogProductContent, language: CatalogLanguage): string {
  const name = localize(product.name, product.nameEn, language);
  if (name) {
    const resolvedName = dedupeRepeatedName(name);
    if (isPlaceholderTitle(resolvedName)) {
      const identification = localize(product.identificationPt, product.identificationEn, language);
      if (identification && isTitleLikeIdentification(identification)) return identification.trim();
    }
    return resolvedName;
  }

  if (product.sku?.trim()) return product.sku.trim();

  return UNNAMED_LABEL[language];
}

export interface CatalogBodyText {
  text: string;
  // "identification": proposta de identificação por IA confirmada pelo
  // admin. "description": description própria da peça (o aviso legal
  // genérico nunca entra aqui — ver isGenericLegalNotice). Ver
  // resolveBodyText para a ordem de preferência (REVISÃO FINAL item 2).
  source: "identification" | "description";
}

const DIACRITIC_MARKS = new RegExp("[̀-ͯ]", "g");
// Pontuação ignorada na comparação de prefixo (ver REVISÃO FINAL item 2:
// "ignorando maiúsculas, acentos e pontuação") — removida por completo (não
// só normalizada), já que só serve para decidir SE o corpo começa com o
// nome, nunca para reconstruir o texto exibido.
const PUNCTUATION_MARKS = /[.,;:!?()[\]{}'"«»„“”‘’…\-–—]/g;

function normalizeForPrefixMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITIC_MARKS, "")
    .replace(PUNCTUATION_MARKS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

// Limpeza defensiva de nome duplicado (ver AJUSTES A4/CATÁLOGO item 5):
// detecta um texto formado por uma sequência repetida duas vezes, idêntica
// ignorando maiúsculas/acentos/espaçamento — com ou sem separador (" - ",
// " – ", " / " etc.) entre as repetições — e devolve só a primeira
// ocorrência. Não altera textos sem essa repetição exata (não tenta
// detectar repetição parcial de palavras legítimas, ex. "Pedra Rosa Rosada").
const REPEAT_SEPARATORS = [" - ", " – ", " — ", " / ", " | "];

export function dedupeRepeatedName(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  for (const sep of REPEAT_SEPARATORS) {
    const idx = trimmed.indexOf(sep);
    if (idx <= 0) continue;
    const first = trimmed.slice(0, idx);
    const second = trimmed.slice(idx + sep.length);
    if (first.length >= 3 && normalizeForPrefixMatch(first) === normalizeForPrefixMatch(second)) {
      return first;
    }
  }

  const words = wordsOf(trimmed);
  if (words.length >= 2 && words.length % 2 === 0) {
    const half = words.length / 2;
    const firstHalf = words.slice(0, half).join(" ");
    const secondHalf = words.slice(half).join(" ");
    if (firstHalf.length >= 3 && normalizeForPrefixMatch(firstHalf) === normalizeForPrefixMatch(secondHalf)) {
      return firstHalf;
    }
  }

  return trimmed;
}

// Remove, do INÍCIO do corpo (identificação ou descrição), uma repetição do
// nome da peça (ver REVISÃO FINAL item 2: "se o corpo começar com o nome da
// peça... remover esse começo; se o corpo ficar vazio, não mostrar") —
// comparação por PALAVRA (não por caractere) para não depender de acento/
// maiúscula/pontuação nem de como normalize() altera o comprimento da
// string (NFD decompõe acentos em caractere base + marca, mudando o
// comprimento). Um separador solto (hífen/travessão/vírgula/dois-pontos)
// entre o nome e o resto é absorvido pela comparação por palavra (a
// pontuação já foi removida em normalizeForPrefixMatch) — qualquer
// pontuação remanescente colada ao resto é aparada à parte.
//
// Devolve null (não o texto original) quando sobra vazia — diferente da
// limpeza da rodada anterior: agora o corpo pode vir da IDENTIFICAÇÃO, que
// frequentemente É só o nome (ex.: peça cujo nome cadastrado já é exato o
// que a IA identificou) — nesse caso mostrar de novo o nome como "corpo"
// seria pura duplicação visual, por isso a peça fica sem corpo nenhum.
function stripLeadingNameRepeat(text: string, title: string): string | null {
  const titleWords = wordsOf(title);
  const textWords = wordsOf(text);
  if (titleWords.length === 0 || textWords.length < titleWords.length) return text;

  const prefix = textWords.slice(0, titleWords.length).join(" ");
  if (normalizeForPrefixMatch(prefix) !== normalizeForPrefixMatch(title)) return text;

  const rest = textWords
    .slice(titleWords.length)
    .join(" ")
    .replace(/^[-:,;.–—]+\s*/, "")
    .trim();
  return rest.length > 0 ? rest : null;
}

// Muitas peças (sobretudo as de importação em lote) têm, no campo
// `description`/`descriptionEn`, só o aviso legal genérico de pedra natural
// — texto de boilerplate conhecido nos dados reais (ver investigação
// abaixo), DESACOPLADO de pdfPages.ts CATALOG_LEGAL_NOTICE desde o ajuste
// "página de informações" (a pedido do Felipe): CATALOG_LEGAL_NOTICE agora
// mostra um texto de curadoria bem diferente (e mais curto, com palavras
// comuns como "peça"/"pedra"), que NÃO é o boilerplate procurado aqui — se
// esta lista continuasse derivada dele, uma description real e curta como
// "Peça lapidada." passaria a bater >=50% de sobreposição de palavras com o
// novo parágrafo de curadoria (que também usa "peça") e seria incorretamente
// tratada como "sem descrição própria". Detectado e corrigido durante este
// mesmo ajuste (teste "peça com description, peso e tamanho não entra em
// missingData" pegou a regressão). Por isso o texto abaixo é fixo, reflete
// o boilerplate REAL que já existe no banco, não o que a página exibe hoje.
//
// Por quê não um simples prefixo fixo: investigação nos 109 produtos reais
// (script __investigateNoticeVariants.ts) mostrou que o `description` (PT) é
// byte-idêntico em TODAS as 109 peças (1 variante só), mas o `descriptionEn`
// tem 107 variantes DISTINTAS — cada peça foi traduzida independentemente
// por IA (ver translateProductText), então cada uma usa sinônimos/ordem de
// frase diferentes ("merely illustrative" vs "purely illustrative" vs "for
// illustrative purposes only"; "will not necessarily be identical" vs "may
// not be identical"; "stock availability" vs "availability in stock"; etc.)
// — nenhum prefixo exato cobre as 107. Por isso: presença de >=2 das
// frases-chave abaixo (robusto a reordenação/sinônimo de QUALQUER das
// outras), OU alta similaridade (sobreposição de palavras) com o aviso
// canônico de qualquer idioma (rede de segurança para variantes futuras que
// não bati-am nenhuma frase-chave).
const GENERIC_NOTICE_KEYWORDS = [
  "produto natural",
  "natural product",
  "cada pedra e unica",
  "each stone is unique",
  "caracteristicas minerais",
  "mineral characteristics",
  "aproximad",
  "approximate",
  "identica a fotografia",
  "identical to the photograph",
  "ilustrativ",
  "illustrat",
];
const GENERIC_NOTICE_KEYWORD_THRESHOLD = 2;

// Sobreposição de palavras (Jaccard simples) entre o texto normalizado e
// cada parágrafo do aviso canônico (os dois idiomas — a peça pode ter o
// idioma "errado" cadastrado por engano) — serve de rede de segurança caso
// uma variante futura não bata em 2 frases-chave.
const GENERIC_NOTICE_SIMILARITY_THRESHOLD = 0.5;

function wordOverlapRatio(a: string, b: string): number {
  const wordsA = new Set(wordsOf(a));
  const wordsB = new Set(wordsOf(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const word of wordsA) if (wordsB.has(word)) shared++;
  return shared / Math.min(wordsA.size, wordsB.size);
}

// Texto literal do boilerplate real encontrado no campo `description` dos
// produtos (ver comentário acima) — NÃO é mais o que a página de
// informações exibe (isso vive em pdfPages.ts CATALOG_LEGAL_NOTICE,
// conteúdo independente desde o ajuste "página de informações").
const LEGACY_DESCRIPTION_BOILERPLATE: Record<CatalogLanguage, string[]> = {
  pt: [
    "Por se tratar de um produto natural, cada pedra é única e pode apresentar variações de tamanho, peso, formato, tonalidade, textura e características minerais.",
    "As medidas e o peso informados na descrição são aproximados e servem como referência, podendo apresentar pequenas diferenças entre as unidades.",
    "A pedra recebida será de qualidade e características semelhantes às apresentadas nas imagens, porém não será necessariamente idêntica à fotografia, justamente em razão das variações naturais dos minerais e da disponibilidade em estoque.",
    "As imagens são meramente ilustrativas e representam o padrão do produto comercializado.",
  ],
  en: [
    "As a natural product, each stone is unique and may present variations in size, weight, shape, color tone, texture, and mineral characteristics.",
    "The measurements and weight provided in the description are approximate and serve as a reference, and may present slight differences between units.",
    "The stone received will be of quality and characteristics similar to those shown in the images, but will not necessarily be identical to the photograph, precisely due to natural variations in minerals and stock availability.",
    "The images are merely illustrative and represent the standard of the product sold.",
  ],
};

const KNOWN_NOTICE_PARAGRAPHS = Object.values(LEGACY_DESCRIPTION_BOILERPLATE)
  .flat()
  .map((paragraph) => normalizeForPrefixMatch(paragraph));

export function isGenericLegalNotice(text: string): boolean {
  const normalized = normalizeForPrefixMatch(text);

  const keywordMatches = GENERIC_NOTICE_KEYWORDS.filter((keyword) => normalized.includes(keyword)).length;
  if (keywordMatches >= GENERIC_NOTICE_KEYWORD_THRESHOLD) return true;

  return KNOWN_NOTICE_PARAGRAPHS.some(
    (paragraph) => wordOverlapRatio(normalized, paragraph) >= GENERIC_NOTICE_SIMILARITY_THRESHOLD,
  );
}

// A IA de identificação continua sendo GERADORA DE NOMES (confirmado pelo
// Felipe) — identificationPt/En é tipicamente uma correção/variação curta
// do nome (ex.: "Cianita Azul em Matriz" -> "Cianita em Matriz"), nunca um
// corpo descritivo de verdade, mesmo quando diverge bastante do nome
// cadastrado (o nome é sempre a versão corrigida pelo admin, logo é a
// verdade). Mostrar essa variação como "corpo" da peça duplica visualmente
// o nome — título e corpo dizem quase a mesma coisa com palavras diferentes
// — que é o bug relatado. Por isso identificação "parecida com título" (ver
// isTitleLikeIdentification) NUNCA é usada como corpo, independente de
// quão parecida ou diferente ela seja do nome.
const TITLE_LIKE_MAX_WORDS = 10;

// Curta (até 10 palavras), sem ponto final (frase completa) e sem quebra de
// linha — ou seja, tem o formato de um título/nome alternativo, não de uma
// descrição corrida. Uma identificação descritiva de verdade (texto corrido
// com frase(s) completa(s)) continua podendo virar corpo normalmente.
export function isTitleLikeIdentification(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.includes("\n")) return false;
  if (trimmed.includes(".")) return false;
  return wordsOf(trimmed).length <= TITLE_LIKE_MAX_WORDS;
}

// Corpo de texto da página da peça (ver REVISÃO FINAL item 2 — ordem
// trocada em relação à rodada anterior, agora que o TÍTULO é sempre o nome,
// não mais a identificação): identificação por IA, só quando NÃO for
// title-like (ver isTitleLikeIdentification) -> description própria da
// peça (só se não for o aviso legal genérico — o aviso completo mora só na
// página de contato) -> nada.
//
// Em QUALQUER fonte usada como corpo, se o texto começar repetindo o nome
// (já o título, ver resolveTitle), esse começo é removido (ver
// stripLeadingNameRepeat) — e se não sobrar nada depois (corpo que era só o
// nome), a peça fica sem corpo (não mostra o nome de novo). `title` já vem
// resolvido por resolveTitle. Texto vindo do banco é DADO puro — nenhuma
// interpretação de markup aqui.
export function resolveBodyText(product: CatalogProductContent, language: CatalogLanguage, title: string): CatalogBodyText | null {
  const identification = localize(product.identificationPt, product.identificationEn, language);
  if (identification && !isTitleLikeIdentification(identification)) {
    const stripped = stripLeadingNameRepeat(identification, title);
    // Identificação sobrou vazia (era só o nome, já mostrado no título) —
    // cai para a description, em vez de deixar a peça sem corpo algum
    // quando ela tem uma descrição própria de verdade para mostrar.
    if (stripped) return { text: stripped, source: "identification" };
  }

  const description = language === "en" ? product.descriptionEn?.trim() || product.description?.trim() : product.description?.trim();
  if (!description || isGenericLegalNotice(description)) return null;

  const stripped = stripLeadingNameRepeat(description, title);
  if (!stripped) return null;
  return { text: stripped, source: "description" };
}

// Nome provisório de importação em lote ("Pedra 1234 - Peso" / "Stone 1234 -
// Weight") — a peça ainda não recebeu um nome de catálogo de verdade. Sem
// identificação title-like disponível, o título continua sendo exibido
// normalmente (ver resolveTitle) e isto sinaliza a peça em `warnings` (ver
// generateCatalogPdf) para o admin saber que precisa revisar, sem bloquear
// a geração do catálogo. Com identificação title-like disponível,
// resolveTitle já troca o título por ela ANTES desta checagem rodar em
// generateCatalogPdf — então o aviso não dispara (o título deixa de ser
// placeholder).
const PLACEHOLDER_TITLE_PATTERN = /^(pedra|stone)\s+\d+\s*-\s*(peso|weight)$/i;

export function isPlaceholderTitle(title: string): boolean {
  return PLACEHOLDER_TITLE_PATTERN.test(title.trim());
}
