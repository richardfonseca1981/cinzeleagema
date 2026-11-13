import PDFDocument from "pdfkit";
import { prisma } from "../prisma";
import { getObject } from "../r2";
import { getExchangeRate, type ExchangeRateSource } from "../exchangeRate";
import { DEFAULT_ORDER_BY } from "../productSort";
import { PAGE_HEIGHT, PAGE_WIDTH } from "./layout";
import {
  registerCatalogFonts,
  drawCoverPage,
  drawProductPage,
  drawContactPage,
  drawCategoryDividerPage,
  computeProductPanelLayout,
  type ProductPanelLayout,
} from "./pdfPages";
import { processCatalogPhoto, type CatalogPhotoFit, type CatalogPhotoQuality } from "./photoLayer";
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
// Exportado: reaproveitado pelo sitemap público (ver lib/sitemapEligibility.ts)
// para usar a MESMA regra de preço provisório, em vez de duplicar o valor.
export const PLACEHOLDER_PRICE_MAX = 1;

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
  // "contain": foto inteira visível, pode deixar faixas laterais/topo-base
  // desfocadas. "cover": preenche a área toda, cortando o excedente da
  // foto. "trim" (default — ver 3ª rodada de revisão visual): recorta só o
  // fundo vazio real do topo/base ANTES de aplicar "contain", reduzindo as
  // faixas sem nunca cortar a peça — ver photoLayer.ts CatalogPhotoFit e
  // analyzeBackgroundTrim.
  photoFit?: CatalogPhotoFit;
  // Chamado depois de CADA peça processada (desenhada OU pulada por falha no
  // R2) — nunca para peças sem foto (essas não entram no total, já são
  // conhecidas antes de começar). Usado pela Etapa B para a barra de
  // progresso ("Gerando 37/107…"); opcional, sem custo quando omitido.
  onProgress?: (done: number, total: number) => void;
  // USO INTERNO/SCRIPTS — nunca exposto pela rota HTTP (ver
  // routes/catalogJob.routes.ts, que não aceita este campo): sobrepõe em
  // memória identificationPt/En de peças específicas (por id), sem gravar
  // nada no banco. Criado para scripts/generateRealCatalogSamples.ts
  // conseguir demonstrar o caso "identificação por IA" com uma proposta
  // REAL (gerada pela mesma rota do admin) sem chamar saveIdentification —
  // reaproveitando o pipeline real (preço/avisos/dados ausentes) em vez de
  // reimplementar a montagem da página numa cópia paralela (reimplementação
  // que já causou uma regressão real: ver AJUSTES revisão final item 1).
  productIdentificationOverrides?: Record<string, { identificationPt: string | null; identificationEn: string | null }>;
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

// Peça que entrou no catálogo mas ficou sem descrição e/ou peso e/ou
// tamanho (ver AJUSTES A4/CATÁLOGO item 4) — nunca inventados/mostrados como
// "–" na página, só omitidos; esta lista é o que vira
// backend/tmp/catalogo-faltando-dados.csv para o admin completar os dados no
// cadastro da peça. Só entra aqui quem está faltando PELO MENOS UM dos três
// (peça com os três preenchidos não aparece).
export interface CatalogMissingDataEntry {
  id: string;
  ref: string | null;
  title: string;
  missingDescription: boolean;
  missingWeight: boolean;
  missingSize: boolean;
}

export interface GenerateCatalogPdfResult {
  buffer: Buffer;
  pageCount: number;
  skipped: SkippedProduct[];
  warnings: CatalogWarning[];
  missingData: CatalogMissingDataEntry[];
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
  weightGrams: true,
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
    photoFit = "trim",
    onProgress,
    productIdentificationOverrides,
  } = options;

  // Mesma ordem das peças do admin (ver lib/productSort.ts DEFAULT_ORDER_BY)
  // mesmo quando só um subconjunto é pedido — o catálogo sempre reflete a
  // ordem definida no admin, não a ordem em que os ids vieram no parâmetro.
  const productsFromDb = await prisma.product.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      ...(productIds && productIds.length > 0 ? { id: { in: productIds } } : {}),
    },
    orderBy: DEFAULT_ORDER_BY,
    select: CATALOG_PRODUCT_SELECT,
  });

  // Sobreposição em memória (ver productIdentificationOverrides) — nunca
  // escreve no banco, só troca o que ESTE catálogo vê para a peça.
  const products = productIdentificationOverrides
    ? productsFromDb.map((product) => {
        const override = productIdentificationOverrides[product.id];
        return override ? { ...product, identificationPt: override.identificationPt, identificationEn: override.identificationEn } : product;
      })
    : productsFromDb;

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

  // Página de informações (logo, WhatsApp, site, texto de curadoria) — movida
  // para a 2ª posição (FIX CATÁLOGO/PÁGINA DE INFORMAÇÕES, a pedido do
  // Felipe); antes era a última página do catálogo. drawContactPage desenha
  // a MESMA página inteira (nunca separada em duas), só a posição mudou —
  // ver pdfPages.ts para o conteúdo. Com isso, o catálogo passa a terminar
  // na última página de peça (ou no divisor de categoria, se a última
  // categoria ficar sem nenhuma peça com foto — caso que não ocorre na
  // prática, já que groupProductsByCategory só cria grupos com itens).
  if (includeContactPage) {
    doc.addPage();
    pageCount++;
    drawContactPage(doc, { language });
  }

  // Passo 1: resolve título/descrição/avisos/dados-faltando e calcula o
  // layout do painel (ver pdfPages.ts computeProductPanelLayout) para TODAS
  // as peças de uma vez — pura medição de texto, sem I/O, então não precisa
  // de concorrência. Decidido ANTES de buscar qualquer foto porque a altura
  // da área de foto (photoAreaHeight) varia por peça (ver AJUSTES revisão
  // visual item 3: painel compacto) e processCatalogPhoto precisa saber essa
  // altura para redimensionar a foto no tamanho certo.
  const warnings: CatalogWarning[] = [];
  const missingData: CatalogMissingDataEntry[] = [];
  const prepared = orderedWithPhoto.map((product) => {
    const title = resolveTitle(product, language);
    if (isPlaceholderTitle(title)) {
      warnings.push({ id: product.id, ref: product.sku, title, reason: "Nome provisório (padrão de importação em lote)" });
    }

    const rawPrice = product.price === null ? null : Number(product.price);
    const isPlaceholderPrice = rawPrice !== null && rawPrice <= PLACEHOLDER_PRICE_MAX;
    if (isPlaceholderPrice) {
      warnings.push({ id: product.id, ref: product.sku, title, reason: "Preço provisório (≤ R$ 1,00)" });
    }

    const body = resolveBodyText(product, language, title);
    const sizeCm = Number(product.sizeCm);
    const weightGrams = Number(product.weightGrams);

    // Dado ausente (ver AJUSTES A4/CATÁLOGO item 4): nunca inventado/mostrado
    // como "–" na página (drawProductPage já omite a linha) — aqui só
    // registra, para o admin completar no cadastro (CSV + tela "Gerar
    // catálogo", ver catalogJobs.ts/routes).
    const missingDescription = body === null;
    const missingWeight = weightGrams <= 0;
    const missingSize = sizeCm <= 0;
    if (missingDescription || missingWeight || missingSize) {
      missingData.push({ id: product.id, ref: product.sku, title, missingDescription, missingWeight, missingSize });
    }

    const price = isPlaceholderPrice ? null : rawPrice;
    const layout = computeProductPanelLayout(doc, { language, title, sku: product.sku, showRef, body, sizeCm, weightGrams, showPrice });
    if (layout.title.truncated) {
      warnings.push({ id: product.id, ref: product.sku, title, reason: "Nome truncado (não coube nem reduzindo a fonte)" });
    }
    if (layout.description?.truncated) {
      warnings.push({ id: product.id, ref: product.sku, title, reason: "Descrição truncada (não coube nem reduzindo a fonte)" });
    }

    return { product, layout, price };
  });

  // Passo 2: busca/redimensiona até PHOTO_CONCURRENCY fotos em paralelo
  // (cada uma já no tamanho definido pelo layout calculado acima), mas
  // escreve (e descarta) uma página por vez, na ordem final (com divisores,
  // se houver) — ver concurrencyPool.ts.
  const totalToProcess = prepared.length;
  let index = 0;
  for await (const result of mapWithConcurrency(prepared, PHOTO_CONCURRENCY, async (item) => {
    try {
      const raw = await getObject(item.product.images[0].key);
      const photo = await processCatalogPhoto(raw, { quality, photoFit, photoAreaHeight: item.layout.photoAreaHeight });
      return { ...item, photo, errorMessage: null as string | null };
    } catch (err) {
      return { ...item, photo: null, errorMessage: err instanceof Error ? err.message : "Falha ao buscar a foto" };
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

    if (!result.photo) {
      skipped.push({ id: result.product.id, reason: `Falha ao buscar a foto no R2 (${result.errorMessage})` });
      continue;
    }

    doc.addPage();
    pageCount++;
    drawProductPage(doc, {
      language,
      showPrice,
      exchangeRate,
      photo: result.photo,
      price: result.price,
      seed: result.product.id,
      layout: result.layout as ProductPanelLayout,
    });
  }

  doc.end();
  const buffer = await finished;
  return { buffer, pageCount, skipped, warnings, missingData, categoryDividersIncluded, rate: exchangeRate, rateSource, rateUpdatedAt };
}
