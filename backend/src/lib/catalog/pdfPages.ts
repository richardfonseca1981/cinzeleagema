import { CATALOG_LOGO_PNG_BASE64, CATALOG_LOGO_WIDTH, CATALOG_LOGO_HEIGHT } from "./logo";
import { CATALOG_FONTS } from "./fonts";
import {
  BOTTOM_MARGIN,
  COLOR_GOLD,
  COLOR_NAVY,
  COLOR_WHITE,
  COLOR_WHITE_MUTED,
  CONTACT_INFO_FONT_SIZE,
  CONTACT_INFO_GAP,
  CONTACT_LEGAL_BODY_FONT_SIZE,
  CONTACT_LEGAL_HEADING_FONT_SIZE,
  CONTACT_LEGAL_HEADING_GAP,
  CONTACT_LEGAL_PARAGRAPH_GAP,
  CONTACT_LINE_GAP,
  CONTACT_LINE_WIDTH,
  CONTACT_LOGO_GAP,
  CONTACT_LOGO_WIDTH,
  CONTACT_TITLE_FONT_SIZE,
  CONTACT_TITLE_GAP,
  COVER_BRAND_FONT_SIZE,
  COVER_BRAND_GAP,
  COVER_DATE_FONT_SIZE,
  COVER_DATE_GAP,
  COVER_LINE_GAP,
  COVER_LINE_WIDTH,
  COVER_LOGO_WIDTH,
  COVER_TITLE_FONT_SIZE,
  COVER_TITLE_GAP,
  DESCRIPTION_MAX_FONT_SIZE,
  DESCRIPTION_MAX_HEIGHT,
  DESCRIPTION_MIN_FONT_SIZE,
  DIVIDER_LABEL_FONT_SIZE,
  DIVIDER_LINE_OFFSET,
  DIVIDER_LINE_WIDTH,
  DIVIDER_PIECES_FONT_SIZE,
  DIVIDER_PIECES_OFFSET,
  FOOTER_GAP,
  FOOTER_ROW_RESERVE,
  LEGAL_LINE_FONT_SIZE,
  LEGAL_LINE_GAP,
  MAX_TITLE_LINES,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  PANEL_BLOCK_GAP,
  PANEL_MARGIN_X,
  PANEL_TOP_PADDING,
  PHOTO_AREA_MAX_FRACTION,
  PHOTO_AREA_MIN_FRACTION,
  PRICE_FONT_SIZE,
  PRICE_UNAVAILABLE_FONT_SIZE,
  REF_FONT_SIZE,
  SPEC_FONT_SIZE,
  TITLE_FONT_SIZE,
  TITLE_MIN_FONT_SIZE,
} from "./layout";
import { fitDescriptionText, fitTitleText } from "./textFit";
import { generateSparkles } from "./sparkles";
import { formatPriceParts, type PriceParts } from "./price";
import type { CatalogBodyText, CatalogLanguage } from "./content";
import type { ProcessedCatalogPhoto } from "./photoLayer";

const CATALOG_LOGO_BUFFER = Buffer.from(CATALOG_LOGO_PNG_BASE64, "base64");
const LOGO_ASPECT = CATALOG_LOGO_WIDTH / CATALOG_LOGO_HEIGHT;

const LABELS = {
  pt: {
    coverTitle: "Catálogo",
    coverBrand: "O Cinzel e a Gema",
    generatedOn: (date: string) => `Gerado em ${date}`,
    contactTitle: "Contato",
    contactWhatsapp: "WhatsApp: (14) 99608-1388",
    contactSite: "cinzeleagema.com.br",
    legalNoticeHeading: "Avisos importantes",
    priceOnRequest: "Consulte o valor",
    ref: "Ref:",
    specWeight: "Peso:",
    specSize: "Tamanho:",
    legalLine: "Peça natural — ver avisos importantes na página de contato.",
    pieces: (n: number) => `${n} ${n === 1 ? "peça" : "peças"}`,
  },
  en: {
    coverTitle: "Catalog",
    coverBrand: "O Cinzel e a Gema",
    generatedOn: (date: string) => `Generated on ${date}`,
    contactTitle: "Contact",
    contactWhatsapp: "WhatsApp: +55 (14) 99608-1388",
    contactSite: "cinzeleagema.com.br",
    legalNoticeHeading: "Important notices",
    priceOnRequest: "Price on request",
    ref: "Ref:",
    specWeight: "Weight:",
    specSize: "Size:",
    legalLine: "Natural piece — see important notices on the contact page.",
    pieces: (n: number) => `${n} ${n === 1 ? "piece" : "pieces"}`,
  },
} as const satisfies Record<CatalogLanguage, Record<string, unknown>>;

// Aviso legal completo — mostrado UMA vez na página de contato (ver AJUSTES
// VISUAIS item 3/8), não mais repetido em toda página de peça. Mesmo texto
// (real, já em uso) que antes vinha do campo `description` de peças sem
// descrição própria — ver CONTEXT do pedido.
export const CATALOG_LEGAL_NOTICE: Record<CatalogLanguage, string[]> = {
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

function formatGeneratedDate(date: Date, language: CatalogLanguage): string {
  const locale = language === "en" ? "en-US" : "pt-BR";
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(date);
}

function formatDecimal(value: number, language: CatalogLanguage): string {
  const locale = language === "en" ? "en-US" : "pt-BR";
  return value.toLocaleString(locale, { maximumFractionDigits: 1 });
}

// "Tam. 23cm" / "Size 23cm" (ver AJUSTES VISUAIS item 5) — sizeCm é sempre
// numérico puro no banco (Decimal), então "duplicar a unidade" não pode
// acontecer pelo caminho atual; o teste defensivo (não adicionar "cm" se já
// terminar em "cm") só protege uma mudança futura do tipo do campo.
function formatSizeLabel(sizeCm: number, language: CatalogLanguage): string {
  const formatted = formatDecimal(sizeCm, language);
  return /cm$/i.test(formatted) ? formatted : `${formatted}cm`;
}

// "850 g" até 999g; a partir de 1000g vira kg com 1 casa decimal — "1,2 kg"
// em PT, "1.2 kg" em EN (ver AJUSTES A4/CATÁLOGO item 4). Peso < 1g (restos
// de arredondamento) nunca ocorre na prática (weightGrams > 0 já é checado
// por quem chama antes de formatar), mas Math.round cobre o caso trivial.
export function formatWeightLabel(weightGrams: number, language: CatalogLanguage): string {
  if (weightGrams < 1000) return `${Math.round(weightGrams)} g`;
  return `${formatDecimal(weightGrams / 1000, language)} kg`;
}

// Todas as fontes TTF embutidas, registradas sob um alias curto — chamar
// uma vez por PDFDocument, antes de desenhar qualquer página.
export function registerCatalogFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont("cinzel-bold", CATALOG_FONTS.cinzelBold);
  doc.registerFont("cinzel-regular", CATALOG_FONTS.cinzelRegular);
  doc.registerFont("opensans-regular", CATALOG_FONTS.openSansRegular);
  doc.registerFont("opensans-italic", CATALOG_FONTS.openSansItalic);
  doc.registerFont("opensans-bolditalic", CATALOG_FONTS.openSansBoldItalic);
}

function drawGoldLine(doc: PDFKit.PDFDocument, x: number, y: number, width: number): void {
  doc.save();
  doc.lineWidth(1.5);
  doc.strokeColor(COLOR_GOLD, 1);
  doc.moveTo(x, y).lineTo(x + width, y).stroke();
  doc.restore();
}

// Brilhos dourados sutis no fundo do painel — sempre os mesmos para a mesma
// peça (ver sparkles.ts), desenhados ANTES do texto.
function drawSparkles(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, seed: string): void {
  const sparkles = generateSparkles(seed);
  doc.save();
  for (const sparkle of sparkles) {
    doc.fillOpacity(sparkle.opacity);
    doc.fillColor(COLOR_GOLD);
    doc.circle(x + sparkle.xFraction * width, y + sparkle.yFraction * height, sparkle.radius).fill();
  }
  doc.restore();
}

// Fundo navy + brilhos — usado tanto no painel das páginas de peça quanto,
// por simetria visual, nas páginas de capa, contato e divisor (mesmo estilo).
function drawNavyBackground(doc: PDFKit.PDFDocument, sparkleSeed: string | null): void {
  doc.save();
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(COLOR_NAVY);
  doc.restore();
  if (sparkleSeed) drawSparkles(doc, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, sparkleSeed);
}

function drawLogo(doc: PDFKit.PDFDocument, centerX: number, y: number, width: number): number {
  const height = width / LOGO_ASPECT;
  doc.image(CATALOG_LOGO_BUFFER, centerX - width / 2, y, { width, height });
  return height;
}

export function drawCoverPage(doc: PDFKit.PDFDocument, options: { language: CatalogLanguage; generatedAt?: Date }): void {
  const labels = LABELS[options.language];
  const generatedAt = options.generatedAt ?? new Date();

  drawNavyBackground(doc, "cover");

  // Bloco inteiro (logo + título + marca + linha + data) centralizado
  // verticalmente na página — ver AJUSTES VISUAIS item 1 ("equilibrar o
  // espaço vertical"), em vez de uma posição fixa a 30% do topo.
  const logoWidth = COVER_LOGO_WIDTH;
  const logoHeight = logoWidth / LOGO_ASPECT;
  const titleGap = COVER_TITLE_GAP;
  const titleHeight = COVER_TITLE_FONT_SIZE * 1.2;
  const brandGap = COVER_BRAND_GAP;
  const brandHeight = COVER_BRAND_FONT_SIZE * 1.3;
  const lineGap = COVER_LINE_GAP;
  const dateGap = COVER_DATE_GAP;
  const dateHeight = COVER_DATE_FONT_SIZE * 1.3;
  const totalHeight = logoHeight + titleGap + titleHeight + brandGap + brandHeight + lineGap + dateGap + dateHeight;

  let y = (PAGE_HEIGHT - totalHeight) / 2;
  drawLogo(doc, PAGE_WIDTH / 2, y, logoWidth);
  y += logoHeight + titleGap;

  doc
    .font("cinzel-bold")
    .fontSize(COVER_TITLE_FONT_SIZE)
    .fillColor(COLOR_GOLD)
    .text(labels.coverTitle, 0, y, { width: PAGE_WIDTH, align: "center" });
  y += titleHeight + brandGap;

  doc
    .font("cinzel-regular")
    .fontSize(COVER_BRAND_FONT_SIZE)
    .fillColor(COLOR_WHITE)
    .text(labels.coverBrand, 0, y, { width: PAGE_WIDTH, align: "center" });
  y += brandHeight + lineGap;

  const lineWidth = COVER_LINE_WIDTH;
  drawGoldLine(doc, (PAGE_WIDTH - lineWidth) / 2, y, lineWidth);
  y += dateGap;

  doc
    .font("opensans-regular")
    .fontSize(COVER_DATE_FONT_SIZE)
    .fillColor(COLOR_WHITE_MUTED)
    .text(labels.generatedOn(formatGeneratedDate(generatedAt, options.language)), 0, y, { width: PAGE_WIDTH, align: "center" });
}

export function drawContactPage(doc: PDFKit.PDFDocument, options: { language: CatalogLanguage }): void {
  const labels = LABELS[options.language];
  drawNavyBackground(doc, "contact");

  const contentX = PANEL_MARGIN_X;
  const contentWidth = PAGE_WIDTH - PANEL_MARGIN_X * 2;

  let y = PAGE_HEIGHT * 0.1;

  const logoWidth = CONTACT_LOGO_WIDTH;
  drawLogo(doc, PAGE_WIDTH / 2, y, logoWidth);
  y += logoWidth / LOGO_ASPECT + CONTACT_LOGO_GAP;

  doc
    .font("cinzel-bold")
    .fontSize(CONTACT_TITLE_FONT_SIZE)
    .fillColor(COLOR_GOLD)
    .text(labels.contactTitle, 0, y, { width: PAGE_WIDTH, align: "center" });
  y += CONTACT_TITLE_FONT_SIZE * 1.2 + CONTACT_TITLE_GAP;

  const lineWidth = CONTACT_LINE_WIDTH;
  drawGoldLine(doc, (PAGE_WIDTH - lineWidth) / 2, y, lineWidth);
  y += CONTACT_LINE_GAP;

  doc
    .font("opensans-italic")
    .fontSize(CONTACT_INFO_FONT_SIZE)
    .fillColor(COLOR_WHITE)
    .text(labels.contactWhatsapp, 0, y, { width: PAGE_WIDTH, align: "center" });
  y += CONTACT_INFO_FONT_SIZE * 1.4;

  doc
    .font("opensans-italic")
    .fontSize(CONTACT_INFO_FONT_SIZE)
    .fillColor(COLOR_WHITE)
    .text(labels.contactSite, 0, y, { width: PAGE_WIDTH, align: "center" });
  y += CONTACT_INFO_FONT_SIZE * 1.4 + CONTACT_INFO_GAP;

  // --- Aviso legal completo (ver AJUSTES VISUAIS item 3/8) ---
  doc
    .font("opensans-bolditalic")
    .fontSize(CONTACT_LEGAL_HEADING_FONT_SIZE)
    .fillColor(COLOR_GOLD)
    .text(labels.legalNoticeHeading, contentX, y, { width: contentWidth, align: "center" });
  y += CONTACT_LEGAL_HEADING_FONT_SIZE * 1.3 + CONTACT_LEGAL_HEADING_GAP;

  doc.font("opensans-regular").fontSize(CONTACT_LEGAL_BODY_FONT_SIZE).fillColor(COLOR_WHITE_MUTED);
  for (const paragraph of CATALOG_LEGAL_NOTICE[options.language]) {
    doc.text(paragraph, contentX, y, { width: contentWidth, align: "center", lineGap: 2 });
    y += doc.heightOfString(paragraph, { width: contentWidth, lineGap: 2 }) + CONTACT_LEGAL_PARAGRAPH_GAP;
  }
}

// Divisor de categoria (mesmo estilo visual da capa/contato: navy + brilhos
// + Cinzel + linha dourada) — uma página inteira entre os grupos de peças
// quando o catálogo tem divisores habilitados (ver generateCatalogPdf
// includeCategoryDividers). `categoryLabel` já deve vir localizado (ver
// categories.ts localizeCategoryName) — esta função só desenha.
export function drawCategoryDividerPage(
  doc: PDFKit.PDFDocument,
  options: { categoryLabel: string; itemCount: number; language: CatalogLanguage; seed: string }
): void {
  const labels = LABELS[options.language];
  drawNavyBackground(doc, `divider:${options.seed}`);

  const centerY = PAGE_HEIGHT * 0.44;

  doc
    .font("cinzel-bold")
    .fontSize(DIVIDER_LABEL_FONT_SIZE)
    .fillColor(COLOR_GOLD)
    .text(options.categoryLabel, 0, centerY, { width: PAGE_WIDTH, align: "center" });

  doc
    .font("opensans-regular")
    .fontSize(DIVIDER_PIECES_FONT_SIZE)
    .fillColor(COLOR_WHITE_MUTED)
    .text(labels.pieces(options.itemCount), 0, centerY + DIVIDER_PIECES_OFFSET, { width: PAGE_WIDTH, align: "center" });

  const lineWidth = DIVIDER_LINE_WIDTH;
  drawGoldLine(doc, (PAGE_WIDTH - lineWidth) / 2, centerY + DIVIDER_LINE_OFFSET, lineWidth);
}

export interface ProductPanelContent {
  language: CatalogLanguage;
  title: string;
  sku: string | null;
  showRef: boolean;
  body: CatalogBodyText | null;
  sizeCm: number;
  weightGrams: number;
  showPrice: boolean;
}

// Resultado de computeProductPanelLayout — TUDO que depende do conteúdo
// textual da peça, calculado ANTES de saber a foto (ver AJUSTES revisão
// visual item 3: painel compacto, altura calculada pelo conteúdo real) e
// ANTES de buscar/processar a foto (generateCatalogPdf precisa da
// photoAreaHeight para redimensionar a foto no tamanho certo — ver
// photoLayer.ts). Computado UMA vez por peça e reaproveitado tanto para
// decidir o tamanho da foto quanto para desenhar a página (drawProductPage
// não recalcula nada, só desenha o que está aqui — uma única fonte de
// verdade, sem risco de divergência entre os dois usos).
export interface ProductPanelLayout {
  photoAreaHeight: number;
  panelHeight: number;
  title: { text: string; fontSize: number; height: number; truncated: boolean };
  refText: string | null;
  specLines: string[];
  specLineHeight: number;
  description: { text: string; fontSize: number; height: number; truncated: boolean } | null;
  showFooterPriceRow: boolean;
  legalLineHeight: number;
}

// Mede a altura que o texto ocuparia num dado tamanho de fonte — usada pelo
// fitDescriptionText (textFit.ts) para escolher o maior tamanho que cabe no
// espaço disponível do painel.
function measureBodyHeight(doc: PDFKit.PDFDocument, width: number): (text: string, fontSize: number) => number {
  return (text, fontSize) => {
    doc.font("opensans-italic").fontSize(fontSize);
    return doc.heightOfString(text, { width, lineGap: 2 });
  };
}

// Calcula a altura real de UMA linha (métrica da fonte de verdade, nunca
// uma razão assumida — ver BUG CORRIGIDO em textFit.ts) para o tamanho e
// fonte atualmente selecionados em `doc`.
function currentLineHeight(doc: PDFKit.PDFDocument): number {
  return doc.currentLineHeight(true);
}

// Respiro extra entre linhas passado para `.text()`/`.heightOfString()` nos
// blocos que podem quebrar em mais de uma linha (título e descrição) — ver
// TEXT_LINE_GAP_OPTION abaixo.
const TEXT_LINE_GAP_OPTION = 2;

// SEGUNDO BUG CORRIGIDO (mesma rodada de revisão visual): mesmo depois de
// trocar a razão assumida por doc.currentLineHeight (ver textFit.ts), o
// título de ~190 caracteres ainda truncava ocupando só ~2 das 3 linhas
// permitidas. Causa: o PDFKit soma `lineGap` (aqui TEXT_LINE_GAP_OPTION) a
// CADA linha de heightOfString/.text() (medido empiricamente: 3 linhas a
// 20.43pt de altura real deram 67.28pt com lineGap:2, não 3*20.43=61.29pt —
// a diferença de ~6pt é exatamente 3 * 2), mas o orçamento de
// fitTitleText (maxLines * medida de UMA linha) não incluía esse extra,
// ficando ~6pt menor que a altura real de 3 linhas — suficiente para
// rejeitar erroneamente um texto que cabia perfeitamente em 3 linhas. A
// medida de uma linha usada no orçamento (measureLineHeight) precisa somar
// o MESMO lineGap passado para measureHeight, senão as duas métricas não
// são comparáveis.
const titleLineHeightWithGap = (doc: PDFKit.PDFDocument, fontSize: number): number => {
  doc.font("opensans-bolditalic").fontSize(fontSize);
  return currentLineHeight(doc) + TEXT_LINE_GAP_OPTION;
};

export function computeProductPanelLayout(doc: PDFKit.PDFDocument, content: ProductPanelContent): ProductPanelLayout {
  const labels = LABELS[content.language];
  const contentWidth = PAGE_WIDTH - PANEL_MARGIN_X * 2;

  // --- Título: até MAX_TITLE_LINES linhas, reduzindo a fonte em passos
  // antes de truncar (ver AJUSTES A4/CATÁLOGO item 1 e item 5 da revisão
  // visual). A altura usada no painel é a REAL do resultado (1, 2 ou 3
  // linhas) — nunca mais sempre 3 linhas fixas (ver item 3 da revisão). ---
  const fittedTitle = fitTitleText({
    text: content.title,
    maxLines: MAX_TITLE_LINES,
    minFontSize: TITLE_MIN_FONT_SIZE,
    maxFontSize: TITLE_FONT_SIZE,
    measureLineHeight: (fontSize) => titleLineHeightWithGap(doc, fontSize),
    measureHeight: (text, fontSize) => {
      doc.font("opensans-bolditalic").fontSize(fontSize);
      return doc.heightOfString(text, { width: contentWidth, lineGap: TEXT_LINE_GAP_OPTION });
    },
  });

  // --- Ref: <SKU> (omitida sem SKU ou com showRef=false). ---
  const refText = content.showRef && content.sku?.trim() ? `${labels.ref} ${content.sku.trim()}` : null;

  // --- Ficha técnica: Peso e/ou Tamanho, ROTULADOS, cada um na sua linha —
  // em destaque logo abaixo do título/Ref (ver revisão visual item 4; não
  // mais uma linha pequena ao lado do preço). Omitido individualmente
  // quando ausente (weightGrams/sizeCm <= 0 = não informado). ---
  const specLines: string[] = [];
  if (content.weightGrams > 0) specLines.push(`${labels.specWeight} ${formatWeightLabel(content.weightGrams, content.language)}`);
  if (content.sizeCm > 0) specLines.push(`${labels.specSize} ${formatSizeLabel(content.sizeCm, content.language)}`);
  doc.font("opensans-bolditalic").fontSize(SPEC_FONT_SIZE);
  const specLineHeight = currentLineHeight(doc);

  // --- Rodapé fixo (legal line + linha dourada + linha de preço, se
  // houver) — mesmo texto/tamanho sempre, então a altura não depende do
  // conteúdo da peça (só de showPrice). Peso/tamanho SAÍRAM desta linha
  // (ver revisão visual item 4) — sem preço, a linha de rodapé nem é
  // reservada (nada mais ocupa essa posição). ---
  doc.font("opensans-italic").fontSize(LEGAL_LINE_FONT_SIZE);
  const legalLineHeight = currentLineHeight(doc);
  const showFooterPriceRow = content.showPrice;
  const footerHeight = legalLineHeight + LEGAL_LINE_GAP + BOTTOM_MARGIN + (showFooterPriceRow ? FOOTER_ROW_RESERVE + FOOTER_GAP : 0);

  // --- Soma dos blocos de altura FIXA (sem a descrição, que tem sua própria
  // folga abaixo) — serve tanto para o limite superior do painel quanto
  // para calcular quanto sobra para a descrição. ---
  let fixedBlocksHeight = PANEL_TOP_PADDING + fittedTitle.height;
  if (refText) fixedBlocksHeight += PANEL_BLOCK_GAP + currentLineHeightAt(doc, "opensans-bolditalic", REF_FONT_SIZE);
  if (specLines.length > 0) fixedBlocksHeight += PANEL_BLOCK_GAP + specLines.length * specLineHeight;
  fixedBlocksHeight += PANEL_BLOCK_GAP + footerHeight;

  // --- Painel compacto (ver revisão visual item 3): a altura do painel é a
  // altura REAL do conteúdo, não mais um percentual fixo — limitada só para
  // a foto nunca ficar maior que PHOTO_AREA_MAX_FRACTION (conteúdo mínimo:
  // sobra vira foto) nem menor que PHOTO_AREA_MIN_FRACTION (conteúdo grande:
  // a descrição cede espaço primeiro — ver descBudget abaixo — antes do
  // painel crescer além do limite). ---
  const maxPanelHeight = PAGE_HEIGHT * (1 - PHOTO_AREA_MIN_FRACTION);
  const minPanelHeight = PAGE_HEIGHT * (1 - PHOTO_AREA_MAX_FRACTION);

  let description: ProductPanelLayout["description"] = null;
  if (content.body) {
    const descBudget = Math.min(DESCRIPTION_MAX_HEIGHT, maxPanelHeight - fixedBlocksHeight - PANEL_BLOCK_GAP);
    // Orçamento menor que ~1 linha no tamanho mínimo: a descrição não cabe
    // de forma legível neste painel já cheio de título/Ref/ficha técnica —
    // omite em vez de espremer uma única reticência isolada.
    if (descBudget >= DESCRIPTION_MIN_FONT_SIZE * 1.2) {
      const fitted = fitDescriptionText({
        text: content.body.text,
        maxHeight: descBudget,
        minFontSize: DESCRIPTION_MIN_FONT_SIZE,
        maxFontSize: DESCRIPTION_MAX_FONT_SIZE,
        measureHeight: measureBodyHeight(doc, contentWidth),
      });
      description = { text: fitted.text, fontSize: fitted.fontSize, height: fitted.height, truncated: fitted.truncated };
    }
  }

  const naturalPanelHeight = fixedBlocksHeight + (description ? PANEL_BLOCK_GAP + description.height : 0);
  const panelHeight = Math.max(minPanelHeight, Math.min(maxPanelHeight, naturalPanelHeight));
  const photoAreaHeight = PAGE_HEIGHT - panelHeight;

  return {
    photoAreaHeight,
    panelHeight,
    title: fittedTitle,
    refText,
    specLines,
    specLineHeight,
    description,
    showFooterPriceRow,
    legalLineHeight,
  };
}

// Mesma métrica de currentLineHeight, mas define font/size antes de medir
// (usada para blocos que não são o último `doc.font()/.fontSize()` ainda
// ativo no momento da chamada, ex.: Ref entre o título e a ficha técnica).
function currentLineHeightAt(doc: PDFKit.PDFDocument, font: string, fontSize: number): number {
  doc.font(font).fontSize(fontSize);
  return currentLineHeight(doc);
}

export interface ProductPageOptions {
  language: CatalogLanguage;
  showPrice: boolean;
  exchangeRate: number | null;
  photo: ProcessedCatalogPhoto;
  price: number | null;
  // Id (ou outra referência estável) da peça — semente dos brilhos do
  // painel, para o padrão não mudar entre gerações do catálogo.
  seed: string;
  layout: ProductPanelLayout;
}

export function drawProductPage(doc: PDFKit.PDFDocument, options: ProductPageOptions): void {
  const labels = LABELS[options.language];
  const contentX = PANEL_MARGIN_X;
  const contentWidth = PAGE_WIDTH - PANEL_MARGIN_X * 2;
  const contentRight = PAGE_WIDTH - PANEL_MARGIN_X;
  const { layout } = options;
  const panelTop = layout.photoAreaHeight;

  // --- Foto (contida ou cortada, ver photoLayer.ts CatalogPhotoFit) na área
  // de foto — já pré-composta pelo sharp em UMA única imagem (ver
  // photoLayer.ts — dois `doc.image()` na mesma página antes de texto
  // aciona um bug real do PDFKit 0.20.2 que duplica texto da página). O
  // painel é uma caixa SEPARADA abaixo, sem sobrepor a foto. ---
  doc.image(options.photo.composite, 0, 0, { width: PAGE_WIDTH, height: panelTop });

  // --- Painel escuro (fundo navy + brilhos dourados determinísticos),
  // abaixo da foto — altura compacta, calculada pelo conteúdo real desta
  // peça (ver computeProductPanelLayout). ---
  doc.save();
  doc.rect(0, panelTop, PAGE_WIDTH, layout.panelHeight).fill(COLOR_NAVY);
  doc.restore();
  drawSparkles(doc, 0, panelTop, PAGE_WIDTH, layout.panelHeight, options.seed);

  // --- Título ---
  let cursorY = panelTop + PANEL_TOP_PADDING;
  doc
    .font("opensans-bolditalic")
    .fontSize(layout.title.fontSize)
    .fillColor(COLOR_WHITE)
    .text(layout.title.text, contentX, cursorY, { width: contentWidth, lineGap: 2 });
  cursorY += layout.title.height;

  // --- Ref ---
  if (layout.refText) {
    cursorY += PANEL_BLOCK_GAP;
    doc
      .font("opensans-bolditalic")
      .fontSize(REF_FONT_SIZE)
      .fillColor(COLOR_WHITE)
      .text(layout.refText, contentX, cursorY, { width: contentWidth, lineBreak: false, ellipsis: true });
    cursorY += currentLineHeightAt(doc, "opensans-bolditalic", REF_FONT_SIZE);
  }

  // --- Ficha técnica: Peso/Tamanho rotulados, em destaque, uma linha cada
  // (ver AJUSTES revisão visual item 4). ---
  if (layout.specLines.length > 0) {
    cursorY += PANEL_BLOCK_GAP;
    doc.font("opensans-bolditalic").fontSize(SPEC_FONT_SIZE).fillColor(COLOR_WHITE);
    for (const line of layout.specLines) {
      doc.text(line, contentX, cursorY, { width: contentWidth, lineBreak: false });
      cursorY += layout.specLineHeight;
    }
  }

  // --- Corpo de texto: description própria da peça (ver content.ts
  // resolveBodyText — nunca a identificação por IA, que já é o título). ---
  if (layout.description) {
    cursorY += PANEL_BLOCK_GAP;
    doc
      .font("opensans-italic")
      .fontSize(layout.description.fontSize)
      .fillColor(COLOR_WHITE_MUTED)
      .text(layout.description.text, contentX, cursorY, { width: contentWidth, height: layout.description.height, lineGap: 2 });
  }

  // --- Rodapé (de baixo para cima): linha dourada na base, aviso legal
  // curto acima dela, depois a linha de preço (se houver — peso/tamanho
  // saíram desta linha, ver ficha técnica acima). ---
  const goldLineY = PAGE_HEIGHT - BOTTOM_MARGIN;
  const legalBaselineY = goldLineY - LEGAL_LINE_GAP;
  const footerBaselineY = legalBaselineY - layout.legalLineHeight - FOOTER_GAP;

  if (layout.showFooterPriceRow) {
    if (options.price === null) {
      doc.font("opensans-bolditalic").fontSize(PRICE_UNAVAILABLE_FONT_SIZE).fillColor(COLOR_WHITE);
      const text = labels.priceOnRequest;
      const width = doc.widthOfString(text);
      doc.text(text, contentRight - width, footerBaselineY, { baseline: "alphabetic", lineBreak: false });
    } else {
      drawPrice(doc, formatPriceParts(options.price, options.language, options.exchangeRate), contentRight, footerBaselineY);
    }
  }

  // --- Aviso legal de uma linha (sempre, se couber — ver AJUSTES VISUAIS
  // item 3: o aviso completo mora só na página de contato). ---
  doc
    .font("opensans-italic")
    .fontSize(LEGAL_LINE_FONT_SIZE)
    .fillColor(COLOR_WHITE_MUTED)
    .text(labels.legalLine, contentX, legalBaselineY, { baseline: "alphabetic", width: contentWidth, align: "center", lineBreak: false });

  drawGoldLine(doc, contentX, goldLineY, contentWidth);
}

// "R$ 259,00" / "$ 49.90" — um único tamanho, branco, negrito (ver AJUSTES
// VISUAIS item 4; antes era símbolo pequeno + inteiro grande + centavos
// pequenos, tudo dourado).
function drawPrice(doc: PDFKit.PDFDocument, parts: PriceParts, rightX: number, baselineY: number): void {
  const text = `${parts.symbol} ${parts.integer}${parts.decimalSeparator}${parts.decimals}`;
  doc.font("opensans-bolditalic").fontSize(PRICE_FONT_SIZE).fillColor(COLOR_WHITE);
  const width = doc.widthOfString(text);
  doc.text(text, rightX - width, baselineY, { baseline: "alphabetic", lineBreak: false });
}
