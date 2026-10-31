import { CATALOG_LOGO_PNG_BASE64, CATALOG_LOGO_WIDTH, CATALOG_LOGO_HEIGHT } from "./logo";
import { CATALOG_FONTS } from "./fonts";
import {
  BOTTOM_MARGIN,
  COLOR_GOLD,
  COLOR_NAVY,
  COLOR_WHITE,
  COLOR_WHITE_MUTED,
  DESCRIPTION_MAX_FONT_SIZE,
  DESCRIPTION_MAX_HEIGHT_FALLBACK,
  DESCRIPTION_MAX_HEIGHT_IDENTIFICATION,
  DESCRIPTION_MIN_FONT_SIZE,
  FOOTER_GAP,
  FOOTER_ROW_RESERVE,
  LEGAL_LINE_FONT_SIZE,
  LEGAL_LINE_GAP,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  PANEL_HEIGHT,
  PANEL_MARGIN_X,
  PANEL_TOP_PADDING,
  PHOTO_AREA_HEIGHT,
  PRICE_FONT_SIZE,
  PRICE_UNAVAILABLE_FONT_SIZE,
  REF_FONT_SIZE,
  TAM_FONT_SIZE,
  TITLE_FONT_SIZE,
} from "./layout";
import { fitDescriptionText } from "./textFit";
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
    tam: "Tam.",
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
    tam: "Size",
    legalLine: "Natural piece — see important notices on the contact page.",
    pieces: (n: number) => `${n} ${n === 1 ? "piece" : "pieces"}`,
  },
} as const satisfies Record<CatalogLanguage, Record<string, unknown>>;

// Aviso legal completo — mostrado UMA vez na página de contato (ver AJUSTES
// VISUAIS item 3/8), não mais repetido em toda página de peça. Mesmo texto
// (real, já em uso) que antes vinha do campo `description` de peças sem
// descrição própria — ver CONTEXT do pedido.
const CATALOG_LEGAL_NOTICE: Record<CatalogLanguage, string[]> = {
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
  const logoWidth = 260;
  const logoHeight = logoWidth / LOGO_ASPECT;
  const titleGap = 48;
  const titleHeight = 64 * 1.2;
  const brandGap = 20;
  const brandHeight = 18 * 1.3;
  const lineGap = 28;
  const dateGap = 24;
  const dateHeight = 13 * 1.3;
  const totalHeight = logoHeight + titleGap + titleHeight + brandGap + brandHeight + lineGap + dateGap + dateHeight;

  let y = (PAGE_HEIGHT - totalHeight) / 2;
  drawLogo(doc, PAGE_WIDTH / 2, y, logoWidth);
  y += logoHeight + titleGap;

  doc
    .font("cinzel-bold")
    .fontSize(64)
    .fillColor(COLOR_GOLD)
    .text(labels.coverTitle, 0, y, { width: PAGE_WIDTH, align: "center" });
  y += titleHeight + brandGap;

  doc
    .font("cinzel-regular")
    .fontSize(18)
    .fillColor(COLOR_WHITE)
    .text(labels.coverBrand, 0, y, { width: PAGE_WIDTH, align: "center" });
  y += brandHeight + lineGap;

  const lineWidth = 220;
  drawGoldLine(doc, (PAGE_WIDTH - lineWidth) / 2, y, lineWidth);
  y += dateGap;

  doc
    .font("opensans-regular")
    .fontSize(13)
    .fillColor(COLOR_WHITE_MUTED)
    .text(labels.generatedOn(formatGeneratedDate(generatedAt, options.language)), 0, y, { width: PAGE_WIDTH, align: "center" });
}

export function drawContactPage(doc: PDFKit.PDFDocument, options: { language: CatalogLanguage }): void {
  const labels = LABELS[options.language];
  drawNavyBackground(doc, "contact");

  const contentX = PANEL_MARGIN_X;
  const contentWidth = PAGE_WIDTH - PANEL_MARGIN_X * 2;

  let y = PAGE_HEIGHT * 0.1;

  const logoWidth = 150;
  drawLogo(doc, PAGE_WIDTH / 2, y, logoWidth);
  y += logoWidth / LOGO_ASPECT + 44;

  doc
    .font("cinzel-bold")
    .fontSize(52)
    .fillColor(COLOR_GOLD)
    .text(labels.contactTitle, 0, y, { width: PAGE_WIDTH, align: "center" });
  y += 52 * 1.2 + 28;

  const lineWidth = 180;
  drawGoldLine(doc, (PAGE_WIDTH - lineWidth) / 2, y, lineWidth);
  y += 40;

  doc
    .font("opensans-italic")
    .fontSize(24)
    .fillColor(COLOR_WHITE)
    .text(labels.contactWhatsapp, 0, y, { width: PAGE_WIDTH, align: "center" });
  y += 24 * 1.4;

  doc
    .font("opensans-italic")
    .fontSize(24)
    .fillColor(COLOR_WHITE)
    .text(labels.contactSite, 0, y, { width: PAGE_WIDTH, align: "center" });
  y += 24 * 1.4 + 56;

  // --- Aviso legal completo (ver AJUSTES VISUAIS item 3/8) ---
  doc
    .font("opensans-bolditalic")
    .fontSize(16)
    .fillColor(COLOR_GOLD)
    .text(labels.legalNoticeHeading, contentX, y, { width: contentWidth, align: "center" });
  y += 16 * 1.3 + 18;

  doc.font("opensans-regular").fontSize(12).fillColor(COLOR_WHITE_MUTED);
  for (const paragraph of CATALOG_LEGAL_NOTICE[options.language]) {
    doc.text(paragraph, contentX, y, { width: contentWidth, align: "center", lineGap: 2 });
    y += doc.heightOfString(paragraph, { width: contentWidth, lineGap: 2 }) + 14;
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
    .fontSize(48)
    .fillColor(COLOR_GOLD)
    .text(options.categoryLabel, 0, centerY, { width: PAGE_WIDTH, align: "center" });

  doc
    .font("opensans-regular")
    .fontSize(16)
    .fillColor(COLOR_WHITE_MUTED)
    .text(labels.pieces(options.itemCount), 0, centerY + 64, { width: PAGE_WIDTH, align: "center" });

  const lineWidth = 160;
  drawGoldLine(doc, (PAGE_WIDTH - lineWidth) / 2, centerY + 104, lineWidth);
}

export interface ProductPageOptions {
  language: CatalogLanguage;
  showPrice: boolean;
  showRef: boolean;
  exchangeRate: number | null;
  photo: ProcessedCatalogPhoto;
  title: string;
  body: CatalogBodyText | null;
  sku: string | null;
  sizeCm: number;
  price: number | null;
  // Id (ou outra referência estável) da peça — semente dos brilhos do
  // painel, para o padrão não mudar entre gerações do catálogo.
  seed: string;
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

export function drawProductPage(doc: PDFKit.PDFDocument, options: ProductPageOptions): void {
  const labels = LABELS[options.language];
  const contentX = PANEL_MARGIN_X;
  const contentWidth = PAGE_WIDTH - PANEL_MARGIN_X * 2;
  const contentRight = PAGE_WIDTH - PANEL_MARGIN_X;

  // --- Foto (contida, inteira, sem corte) na área de foto (~68% da altura
  // da página) — já pré-composta com o fundo desfocado pelo sharp em UMA
  // única imagem (ver photoLayer.ts — dois `doc.image()` na mesma página
  // antes de texto aciona um bug real do PDFKit 0.20.2 que duplica texto da
  // página). O painel é uma caixa SEPARADA abaixo, sem sobrepor a foto (ver
  // AJUSTES VISUAIS, 2ª rodada: o painel cobrindo a base da foto cortava
  // peças como obelisco/suporte do ovo de ametista).
  doc.image(options.photo.composite, 0, 0, { width: PAGE_WIDTH, height: PHOTO_AREA_HEIGHT });

  // --- Painel escuro (fundo navy + brilhos dourados determinísticos),
  // abaixo da foto. ---
  doc.save();
  doc.rect(0, PHOTO_AREA_HEIGHT, PAGE_WIDTH, PANEL_HEIGHT).fill(COLOR_NAVY);
  doc.restore();
  drawSparkles(doc, 0, PHOTO_AREA_HEIGHT, PAGE_WIDTH, PANEL_HEIGHT, options.seed);

  // --- Título ---
  let cursorY = PHOTO_AREA_HEIGHT + PANEL_TOP_PADDING;
  const titleLineHeight = TITLE_FONT_SIZE * 1.15;
  const titleBlockHeight = titleLineHeight * 2;
  doc
    .font("opensans-bolditalic")
    .fontSize(TITLE_FONT_SIZE)
    .fillColor(COLOR_WHITE)
    .text(options.title, contentX, cursorY, {
      width: contentWidth,
      height: titleBlockHeight,
      ellipsis: true,
      lineGap: 2,
    });
  cursorY += titleBlockHeight + 8;

  // --- Ref: <SKU> em branco e negrito (omitida sem SKU ou com showRef=false) ---
  if (options.showRef && options.sku?.trim()) {
    doc
      .font("opensans-bolditalic")
      .fontSize(REF_FONT_SIZE)
      .fillColor(COLOR_WHITE)
      .text(`${labels.ref} ${options.sku.trim()}`, contentX, cursorY, {
        width: contentWidth,
        lineBreak: false,
        ellipsis: true,
      });
    cursorY += REF_FONT_SIZE * 1.3 + 10;
  }

  // --- Rodapé (de baixo para cima): linha dourada na base, aviso legal
  // curto acima dela, depois a linha de Tam./preço — ver AJUSTES VISUAIS
  // item 3/4 (linha dourada "abaixo das informações", não mais acima). ---
  const goldLineY = PAGE_HEIGHT - BOTTOM_MARGIN;
  const legalBaselineY = goldLineY - LEGAL_LINE_GAP;
  const footerBaselineY = legalBaselineY - LEGAL_LINE_FONT_SIZE * 1.3 - FOOTER_GAP;
  const footerTop = footerBaselineY - FOOTER_ROW_RESERVE;

  // --- Corpo de texto: identificação por IA (mais espaço) ou description
  // de fallback (capada a poucas linhas) — ver content.ts resolveBodyText. ---
  if (options.body) {
    const cap = options.body.source === "identification" ? DESCRIPTION_MAX_HEIGHT_IDENTIFICATION : DESCRIPTION_MAX_HEIGHT_FALLBACK;
    const maxHeight = Math.max(0, Math.min(cap, footerTop - 16 - cursorY));
    const fitted = fitDescriptionText({
      text: options.body.text,
      maxHeight,
      minFontSize: DESCRIPTION_MIN_FONT_SIZE,
      maxFontSize: DESCRIPTION_MAX_FONT_SIZE,
      measureHeight: measureBodyHeight(doc, contentWidth),
    });
    // Centralizado no espaço reservado em vez de ancorado no topo — textos
    // curtos não deixam um vão vazio grande até o rodapé.
    const bodyY = cursorY + Math.max(0, (maxHeight - fitted.height) / 2);
    doc
      .font("opensans-italic")
      .fontSize(fitted.fontSize)
      .fillColor(COLOR_WHITE_MUTED)
      .text(fitted.text, contentX, bodyY, { width: contentWidth, height: maxHeight, lineGap: 2 });
  }

  // --- Tam. <sizeCm>cm (omitido quando 0 = não informado) ---
  if (options.sizeCm > 0) {
    doc
      .font("opensans-regular")
      .fontSize(TAM_FONT_SIZE)
      .fillColor(COLOR_WHITE)
      .text(`${labels.tam} ${formatSizeLabel(options.sizeCm, options.language)}`, contentX, footerBaselineY, {
        baseline: "alphabetic",
        lineBreak: false,
      });
  }

  // --- Preço: bem maior, branco e em negrito, à direita — ou "Consulte o
  // valor"/"Price on request" sem preço (inclui preço placeholder <= R$1,00,
  // já resolvido para null por quem chama — ver generateCatalogPdf).
  // Removido por completo com showPrice=false. ---
  if (options.showPrice) {
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
