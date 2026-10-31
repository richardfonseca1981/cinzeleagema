import PDFDocument from "pdfkit";
import { prisma } from "../prisma";
import { getObject } from "../r2";
import { getExchangeRate, type ExchangeRateSource } from "../exchangeRate";
import { DEFAULT_ORDER_BY } from "../productSort";
import { PAGE_HEIGHT, PAGE_WIDTH } from "./layout";
import { registerCatalogFonts, drawCoverPage, drawProductPage, drawContactPage, drawCategoryDividerPage } from "./pdfPages";
import { processCatalogPhoto, type CatalogPhotoQuality } from "./photoLayer";
import { isPlaceholderTitle, resolveBodyText, resolveTitle, type CatalogLanguage } from "./content";
import { mapWithConcurrency } from "./concurrencyPool";
import { groupProductsByCategory, localizeCategoryName } from "./categories";

// No máximo 4 fotos sendo buscadas/redimensionadas ao mesmo tempo (ver
// REGRAS: "concorrência limitada... sem estourar memória com 76+ fotos") —
// cada página só é desenhada (e sua foto liberada) depois de pronta, uma a
// uma, em vez de esperar o catálogo inteiro carregar na memória.
const PHOTO_CONCURRENCY = 4;

// Default dos divisores de categoria quando não informado explicitamente:
// só vale a pena separar por categoria num catálogo grande o bastante com
// mais de uma categoria de fato representada — abaixo disso os divisores só
// atrapalhariam (ex.: 5 peças escolhidas a dedo via productIds).
const CATEGORY_DIVIDER_MIN_PRODUCTS = 12;
const CATEGORY_DIVIDER_MIN_CATEGORIES = 2;

// Preço "placeholder" de importação em lote (ex.: R$ 1,00 só para a peça
// entrar no sistema antes da precificação real) — tratado como "Consulte o
// valor"/"Price on request" em vez de um preço real (nunca convertido para
// USD), e sinalizado em `warnings` para o admin revisar.
//
// DECISÃO A CONFIRMAR: "price <= 1,00" foi pedido ao pé da letra, o que
// também pega preço 0 — mas schema.prisma documenta 0 como preço REAL
// (promocional/simbólico), diferente de null, em todo o resto do sistema
// (export Excel, ProductCard do site). Mantive a regra literal (<=1, inclui
// 0) porque foi isso que foi pedido, mas é uma divergência do padrão
// estabelecido em outro lugar — avisar se não era essa a intenção.
const PLACEHOLDER_PRICE_MAX = 1;

export interface GenerateCatalogPdfOptions {
  // Sem productIds: todas as peças (ativas por padrão — ver includeInactive).
  productIds?: string[];
  language: CatalogLanguage;
  // default true — ver REGRAS DE CONTEÚDO.
  showPrice?: boolean;
  showRef?: boolean;
  includeInactive?: boolean;
  // Divisores de categoria (página navy + nome da categoria + bookmark no
  // PDF) entre os grupos. Default: true quando o catálogo gerado tem >= 12
  // peças E >= 2 categorias representadas; false abaixo disso. Passar
  // explicitamente sempre vence o default.
  includeCategoryDividers?: boolean;
  // Página final de contato (logo, WhatsApp, site, aviso legal completo) —
  // default true. false remove essa página (ex.: catálogo embutido em outro
  // material que já tem seus próprios dados de contato).
  includeContactPage?: boolean;
  // "light": fotos menores/mais comprimidas (ver photoLayer.ts) — catálogo
  // final bem mais leve (~8-10 MB mesmo com 100+ peças), para WhatsApp/
  // e-mail. Default "standard" (qualidade atual).
  quality?: CatalogPhotoQuality;
  // Chamado depois de CADA peça processada (desenhada OU pulada por falha no
  // R2) — nunca para peças sem foto (essas não entram no total, já são
  // conhecidas antes de começar). Usado pela Etapa B para a barra de
  // progresso ("Gerando 37/107…"); opcional, sem custo quando omitido.
  onProgress?: (done: number, total: number) => void;
}

export interface SkippedProduct {
  id: string;
  reason: string;
}

// Peça que ENTROU no catálogo normalmente, mas tem algo que vale avisar o
// admin (nome ou preço provisório de importação em lote) — ver AJUSTES
// VISUAIS itens 6/7. Uma peça pode gerar mais de uma entrada (uma por
// motivo). `ref`/`title` vêm junto (não só o id) para dar pra montar uma
// lista legível (ex.: CSV) sem precisar de outra consulta ao banco.
export interface CatalogWarning {
  id: string;
  ref: string | null;
  title: string;
  reason: string;
}

export interface GenerateCatalogPdfResult {
  buffer: Buffer;
  pageCount: number;
  skipped: SkippedProduct[];
  warnings: CatalogWarning[];
  categoryDividersIncluded: boolean;
  // Valor/origem/data da cotação usada (só quando EN + showPrice buscou uma
  // — ver getExchangeRate) — a Etapa B avisa o admin quando a cotação não é
  // "live", mostrando o valor usado (ex.: "R$ 5,30 em 20/10").
  rate: number | null;
  rateSource: ExchangeRateSource | null;
  rateUpdatedAt: Date | null;
}

const CATALOG_PRODUCT_SELECT = {
  id: true,
  name: true,
  nameEn: true,
  sku: true,
  description: true,
  descriptionEn: true,
  identificationPt: true,
  identificationEn: true,
  price: true,
  sizeCm: true,
  category: { select: { name: true } },
  images: { orderBy: { position: "asc" as const }, take: 1, select: { key: true } },
};

export async function generateCatalogPdf(options: GenerateCatalogPdfOptions): Promise<GenerateCatalogPdfResult> {
  const {
    productIds,
    language,
    showPrice = true,
    showRef = true,
    includeInactive = false,
    includeContactPage = true,
    quality = "standard",
    onProgress,
  } = options;

  // Mesma ordem das peças do admin (ver lib/productSort.ts DEFAULT_ORDER_BY)
  // mesmo quando só um subconjunto é pedido — o catálogo sempre reflete a
  // ordem definida no admin, não a ordem em que os ids vieram no parâmetro.
  const products = await prisma.product.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      ...(productIds && productIds.length > 0 ? { id: { in: productIds } } : {}),
    },
    orderBy: DEFAULT_ORDER_BY,
    select: CATALOG_PRODUCT_SELECT,
  });

  const skipped: SkippedProduct[] = [];
  const withPhoto = products
    .filter((product) => {
      if (product.images.length > 0) return true;
      skipped.push({ id: product.id, reason: "Peça sem foto" });
      return false;
    })
    .map((product) => ({ ...product, categoryName: product.category?.name ?? null }));

  const categoriesWithItems = new Set(withPhoto.map((p) => p.categoryName).filter((name): name is string => name !== null));
  const categoryDividersIncluded =
    options.includeCategoryDividers ??
    (withPhoto.length >= CATEGORY_DIVIDER_MIN_PRODUCTS && categoriesWithItems.size >= CATEGORY_DIVIDER_MIN_CATEGORIES);

  // Com divisores: reagrupa por categoria na ordem fixa (ver categories.ts),
  // mantendo o sortOrder relativo dentro de cada grupo. Sem divisores: ordem
  // plana de sortOrder de sempre — não faz sentido reagrupar silenciosamente
  // uma seleção pequena/dedicada (ex.: productIds) sem mostrar os divisores.
  let orderedWithPhoto = withPhoto;
  const dividerBeforeIndex = new Map<number, { categoryName: string | null; itemCount: number }>();
  if (categoryDividersIncluded) {
    const groups = groupProductsByCategory(withPhoto);
    orderedWithPhoto = [];
    for (const group of groups) {
      dividerBeforeIndex.set(orderedWithPhoto.length, { categoryName: group.categoryName, itemCount: group.items.length });
      orderedWithPhoto.push(...group.items);
    }
  }

  // Cotação do dia só quando necessária (catálogo em EN com preço visível) —
  // mesma regra do site público (ver frontend/src/lib/format.ts formatPrice):
  // sem cotação disponível, o preço cai de volta para BRL em vez de travar a
  // geração do catálogo (getExchangeRate nunca lança; o try/catch aqui só
  // protege contra uma mudança futura nessa garantia).
  let exchangeRate: number | null = null;
  let rateSource: ExchangeRateSource | null = null;
  let rateUpdatedAt: Date | null = null;
  if (language === "en" && showPrice) {
    try {
      const result = await getExchangeRate();
      exchangeRate = result.rate;
      rateSource = result.source;
      rateUpdatedAt = result.updatedAt;
    } catch {
      exchangeRate = null;
    }
  }

  const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margins: { top: 0, bottom: 0, left: 0, right: 0 }, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  registerCatalogFonts(doc);

  let pageCount = 0;
  const generatedAt = new Date();

  doc.addPage();
  pageCount++;
  drawCoverPage(doc, { language, generatedAt });

  // Busca/redimensiona até PHOTO_CONCURRENCY fotos em paralelo, mas escreve
  // (e descarta) uma página por vez, na ordem final (com divisores, se
  // houver) — ver concurrencyPool.ts.
  const warnings: CatalogWarning[] = [];
  const totalToProcess = orderedWithPhoto.length;
  let index = 0;
  for await (const prepared of mapWithConcurrency(orderedWithPhoto, PHOTO_CONCURRENCY, async (product) => {
    try {
      const raw = await getObject(product.images[0].key);
      const photo = await processCatalogPhoto(raw, quality);
      return { product, photo, errorMessage: null as string | null };
    } catch (err) {
      return { product, photo: null, errorMessage: err instanceof Error ? err.message : "Falha ao buscar a foto" };
    }
  })) {
    const divider = dividerBeforeIndex.get(index);
    index++;
    onProgress?.(index, totalToProcess);

    if (divider !== undefined) {
      const label =
        divider.categoryName === null ? (language === "en" ? "Uncategorized" : "Sem categoria") : localizeCategoryName(divider.categoryName, language);
      doc.addPage();
      pageCount++;
      drawCategoryDividerPage(doc, { categoryLabel: label, itemCount: divider.itemCount, language, seed: divider.categoryName ?? "uncategorized" });
      doc.outline.addItem(label);
    }

    if (!prepared.photo) {
      skipped.push({ id: prepared.product.id, reason: `Falha ao buscar a foto no R2 (${prepared.errorMessage})` });
      continue;
    }

    const title = resolveTitle(prepared.product, language);
    if (isPlaceholderTitle(title)) {
      warnings.push({ id: prepared.product.id, ref: prepared.product.sku, title, reason: "Nome provisório (padrão de importação em lote)" });
    }

    const rawPrice = prepared.product.price === null ? null : Number(prepared.product.price);
    const isPlaceholderPrice = rawPrice !== null && rawPrice <= PLACEHOLDER_PRICE_MAX;
    if (isPlaceholderPrice) {
      warnings.push({ id: prepared.product.id, ref: prepared.product.sku, title, reason: "Preço provisório (≤ R$ 1,00)" });
    }

    doc.addPage();
    pageCount++;
    drawProductPage(doc, {
      language,
      showPrice,
      showRef,
      exchangeRate,
      photo: prepared.photo,
      title,
      body: resolveBodyText(prepared.product, language),
      sku: prepared.product.sku,
      sizeCm: Number(prepared.product.sizeCm),
      price: isPlaceholderPrice ? null : rawPrice,
      seed: prepared.product.id,
    });
  }

  if (includeContactPage) {
    doc.addPage();
    pageCount++;
    drawContactPage(doc, { language });
  }

  doc.end();
  const buffer = await finished;
  return { buffer, pageCount, skipped, warnings, categoryDividersIncluded, rate: exchangeRate, rateSource, rateUpdatedAt };
}
