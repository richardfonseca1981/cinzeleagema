import { Router } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { EXPORT_LOGO_HEIGHT, EXPORT_LOGO_PNG_BASE64, EXPORT_LOGO_WIDTH } from "../lib/exportLogo";

export const productExportRouter = Router();

// Cores da marca (ver frontend tailwind.config/paleta do admin) em ARGB —
// exceljs exige o canal alpha (FF = opaco) mesmo para cores sólidas.
const NAVY = "FF010B1A";
const GOLD = "FFC78F50";
const WHITE = "FFFFFFFF";
const ZEBRA_LIGHT = "FFF6F1EA";
const BORDER_GRAY = "FFD9D9D9";

const THIN_GRAY_BORDER = {
  top: { style: "thin" as const, color: { argb: BORDER_GRAY } },
  left: { style: "thin" as const, color: { argb: BORDER_GRAY } },
  bottom: { style: "thin" as const, color: { argb: BORDER_GRAY } },
  right: { style: "thin" as const, color: { argb: BORDER_GRAY } },
};

// Mesmas cores do selo de confiança no painel do admin (ver frontend
// lib/identification.ts) — verde/amarelo/vermelho para ALTA/MEDIA/BAIXA.
const CONFIDENCE_STYLE: Record<string, { fill: string; font: string }> = {
  ALTA: { fill: "FFDCFCE7", font: "FF15803D" },
  MEDIA: { fill: "FFFEF3C7", font: "FFB45309" },
  BAIXA: { fill: "FFFEE2E2", font: "FFB91C1C" },
};
const CONFIDENCE_LABEL: Record<string, string> = { ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };
const TREATMENT_LABEL: Record<string, string> = {
  NATURAL: "Natural",
  TINGIDA: "Tingida",
  POSSIVEL_TINGIMENTO: "Possível tingimento",
  SEM_INDICIO: "Sem indício",
};

// Qualquer app de planilha (Excel, Google Sheets, LibreOffice) pode interpretar
// um valor começado em =, +, - ou @ como fórmula. Os campos de texto aqui são
// digitados por humanos (nome, descrição, SKU) e podem começar com esses
// caracteres sem intenção maliciosa nenhuma — mas também é a porta clássica de
// "CSV/formula injection" se o arquivo for reaberto por outra ferramenta.
// Prefixar com apóstrofo é a mitigação padrão: a célula vira texto literal e a
// maioria das planilhas some com o apóstrofo na exibição. Só se aplica a texto
// vindo do banco — os textos fixos do bloco do topo (título, data, totais)
// nunca passam por aqui.
const FORMULA_LEADING_CHARS = new Set(["=", "+", "-", "@"]);
function sanitizeCell(value: string): string {
  return FORMULA_LEADING_CHARS.has(value[0]) ? `'${value}` : value;
}

function sanitizeNullableCell(value: string | null): string | null {
  return value === null ? null : sanitizeCell(value);
}

// Excel não tem conceito de fuso: um Date nativo é serializado pelo valor UTC
// puro (exceljs usa `d.getTime()`, sem ajuste nenhum — ver node_modules/exceljs/
// lib/utils/utils.js:dateToExcel), então em produção (servidor em UTC) uma
// data/hora nativa apareceria com o horário errado. Por isso toda data exibida
// aqui (geração do relatório e também criado/atualizado das peças) é formatada
// como TEXTO já convertido para America/Sao_Paulo — nunca como Date nativo.
// Exportado também para teste direto (sem precisar fakear o relógio do
// processo inteiro) — ver backend/tests/productExport.test.ts.
export function formatSaoPauloDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

// Exportado só para teste direto (sem precisar fakear o relógio do processo
// inteiro) — ver backend/tests/productExport.test.ts.
export function saoPauloDateStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

type Align = "left" | "center" | "right";

interface ColumnDef {
  key: string;
  header: string;
  width: number;
  numFmt?: string;
  wrap?: boolean;
  align: Align;
}

// Única fonte de verdade para largura/formato/alinhamento — usada tanto para
// configurar as colunas quanto para desenhar o cabeçalho manualmente (ver
// comentário em HEADER_ROW sobre por que não dá para usar worksheet.columns
// com "header" direto).
const COLUMNS: ColumnDef[] = [
  { key: "id", header: "ID", width: 26, align: "left" },
  { key: "sku", header: "SKU", width: 16, align: "center" },
  { key: "name", header: "Nome", width: 32, wrap: true, align: "left" },
  { key: "description", header: "Descrição", width: 44, wrap: true, align: "left" },
  { key: "nameEn", header: "Nome (EN)", width: 32, wrap: true, align: "left" },
  { key: "descriptionEn", header: "Descrição (EN)", width: 44, wrap: true, align: "left" },
  { key: "categoryLabel", header: "Categoria", width: 28, wrap: true, align: "left" },
  { key: "price", header: "Preço de venda (R$)", width: 18, numFmt: '"R$" #,##0.00', align: "right" },
  { key: "weightGrams", header: "Peso (g)", width: 12, numFmt: "0.00", align: "center" },
  { key: "sizeCm", header: "Tamanho (cm)", width: 14, numFmt: "0.0", align: "center" },
  { key: "trackStock", header: "Controla estoque", width: 16, align: "center" },
  { key: "stockQty", header: "Quantidade em estoque", width: 20, numFmt: "0", align: "center" },
  { key: "active", header: "Ativo", width: 10, align: "center" },
  { key: "photoUrls", header: "Fotos (URLs)", width: 55, wrap: true, align: "left" },
  { key: "createdAt", header: "Criado em", width: 20, align: "center" },
  { key: "updatedAt", header: "Atualizado em", width: 20, align: "center" },
  // Identificação de catálogo por IA — sempre no fim, sem alterar a ordem
  // das colunas existentes (ver CONTEXT.md/instrução desta entrega).
  { key: "identificationPt", header: "Identificação (PT)", width: 28, wrap: true, align: "left" },
  { key: "identificationEn", header: "Identificação (EN)", width: 28, wrap: true, align: "left" },
  { key: "identificationConfidence", header: "Confiança", width: 14, align: "center" },
  { key: "identificationTreatment", header: "Tratamento", width: 20, align: "center" },
  { key: "identificationNote", header: "Ressalva (interna)", width: 36, wrap: true, align: "left" },
];

// Bloco do topo: 4 linhas de texto (título/subtítulo/gerado em/total) + 1
// linha em branco de respiro, depois o cabeçalho da tabela.
const BANNER_LAST_ROW = 4;
const HEADER_ROW = BANNER_LAST_ROW + 2; // 6 — deixa a linha 5 em branco
const FIRST_DATA_ROW = HEADER_ROW + 1; // 7
// Linha (1-indexed) a partir de onde o texto do banner escreve — colunas A–B
// ficam livres para o logo (A sozinha já tem ~26 "caracteres" de largura,
// bem mais que os ~84px do logo).
const TEXT_FIRST_COL = 3;

// GET /api/admin/products/export — autenticado (mesmo middleware do admin).
// Exporta TODOS os produtos (ativos e inativos), sem paginação nem filtro da
// tela, com todos os campos próprios e das relações (categoria/subcategoria,
// fotos).
productExportRouter.get(
  "/export",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const products = await prisma.product.findMany({
      include: { images: { orderBy: { position: "asc" } }, category: true, subcategory: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });

    const now = new Date();
    const activeCount = products.filter((p) => p.active).length;
    const inactiveCount = products.length - activeCount;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Peças");

    // Sem "header" aqui de propósito: o setter de Column.header do exceljs
    // escreve direto na linha 1 (ver node_modules/exceljs/lib/doc/column.js),
    // e o cabeçalho real desta planilha fica na linha HEADER_ROW (depois do
    // banner) — por isso o texto do cabeçalho é escrito manualmente abaixo.
    worksheet.columns = COLUMNS.map(({ key, width }) => ({ key, width }));

    // --- Banner navy (linhas 1–4, todas as colunas) ---
    for (let r = 1; r <= BANNER_LAST_ROW; r++) {
      const row = worksheet.getRow(r);
      for (let c = 1; c <= COLUMNS.length; c++) {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      }
    }

    function bannerCell(row: number, text: string, font: Partial<ExcelJS.Font>) {
      const anchor = worksheet.getCell(row, TEXT_FIRST_COL);
      anchor.value = text;
      anchor.font = font;
      anchor.alignment = { vertical: "middle" };
      worksheet.mergeCells(row, TEXT_FIRST_COL, row, COLUMNS.length);
    }

    bannerCell(1, "Relatório de Peças", { bold: true, size: 18, color: { argb: GOLD } });
    worksheet.getRow(1).height = 26;

    bannerCell(2, "O Cinzel e a Gema", { italic: true, size: 12, color: { argb: GOLD } });
    worksheet.getRow(2).height = 18;

    bannerCell(3, `Gerado em: ${formatSaoPauloDateTime(now)}`, { size: 10, color: { argb: WHITE } });
    worksheet.getRow(3).height = 15;

    bannerCell(4, `Total de peças: ${products.length} (ativas: ${activeCount}, inativas: ${inactiveCount})`, {
      size: 10,
      color: { argb: WHITE },
    });
    worksheet.getRow(4).height = 15;

    // --- Logo (PNG embutido em build-time — exceljs não lê WebP) ---
    const imageId = workbook.addImage({ base64: EXPORT_LOGO_PNG_BASE64, extension: "png" });
    const LOGO_HEIGHT_PX = 60;
    const LOGO_WIDTH_PX = Math.round(LOGO_HEIGHT_PX * (EXPORT_LOGO_WIDTH / EXPORT_LOGO_HEIGHT));
    worksheet.addImage(imageId, {
      tl: { col: 0.15, row: 0.15 },
      ext: { width: LOGO_WIDTH_PX, height: LOGO_HEIGHT_PX },
    });

    // --- Cabeçalho da tabela ---
    const headerRow = worksheet.getRow(HEADER_ROW);
    COLUMNS.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: GOLD } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.border = THIN_GRAY_BORDER;
    });
    headerRow.height = 32;

    // --- Linhas de dados (zebra) ---
    products.forEach((product, idx) => {
      const categoryLabel = [product.category?.name, product.subcategory?.name].filter(Boolean).join(", ");
      const photoUrls = product.images.map((image) => image.url).join(", ");
      // 0 é o sentinel de "peso/tamanho não informado" neste sistema (mesma
      // convenção da tela do admin, ver frontend lib/adminProductFormat.ts) —
      // célula vazia, não "0,00".
      const weightGrams = Number(product.weightGrams);
      const sizeCm = Number(product.sizeCm);

      const row = worksheet.addRow({
        id: sanitizeCell(product.id),
        sku: sanitizeNullableCell(product.sku),
        name: sanitizeNullableCell(product.name),
        description: sanitizeNullableCell(product.description),
        nameEn: sanitizeNullableCell(product.nameEn),
        descriptionEn: sanitizeNullableCell(product.descriptionEn),
        categoryLabel: categoryLabel ? sanitizeCell(categoryLabel) : null,
        price: product.price !== null ? Number(product.price) : null,
        weightGrams: weightGrams > 0 ? weightGrams : null,
        sizeCm: sizeCm > 0 ? sizeCm : null,
        trackStock: product.trackStock ? "Sim" : "Não",
        stockQty: product.stockQty,
        active: product.active ? "Sim" : "Não",
        photoUrls: photoUrls ? sanitizeCell(photoUrls) : null,
        createdAt: formatSaoPauloDateTime(product.createdAt),
        updatedAt: formatSaoPauloDateTime(product.updatedAt),
        identificationPt: sanitizeNullableCell(product.identificationPt),
        identificationEn: sanitizeNullableCell(product.identificationEn),
        identificationConfidence: product.identificationConfidence
          ? CONFIDENCE_LABEL[product.identificationConfidence] ?? product.identificationConfidence
          : null,
        identificationTreatment: product.identificationTreatment
          ? TREATMENT_LABEL[product.identificationTreatment] ?? product.identificationTreatment
          : null,
        identificationNote: sanitizeNullableCell(product.identificationNote),
      });

      const zebraColor = idx % 2 === 1 ? ZEBRA_LIGHT : WHITE;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const colDef = COLUMNS[colNumber - 1];
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebraColor } };
        cell.border = THIN_GRAY_BORDER;
        cell.alignment = { vertical: "middle", horizontal: colDef.align, wrapText: Boolean(colDef.wrap) };
        if (colDef.numFmt) cell.numFmt = colDef.numFmt;
      });

      // Selo de confiança colorido (verde/amarelo/vermelho), por cima da zebra.
      const confidenceStyle = product.identificationConfidence ? CONFIDENCE_STYLE[product.identificationConfidence] : undefined;
      if (confidenceStyle) {
        const cell = row.getCell("identificationConfidence");
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: confidenceStyle.fill } };
        cell.font = { color: { argb: confidenceStyle.font }, bold: true };
      }
    });

    const lastRow = products.length > 0 ? FIRST_DATA_ROW + products.length - 1 : HEADER_ROW;

    // Painel congelado logo abaixo do cabeçalho da tabela: logo, título e
    // cabeçalho ficam sempre visíveis ao rolar as linhas de dados.
    worksheet.views = [{ state: "frozen", ySplit: HEADER_ROW, topLeftCell: `A${FIRST_DATA_ROW}` }];
    worksheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: lastRow, column: COLUMNS.length } };

    worksheet.pageSetup.orientation = "landscape";
    worksheet.pageSetup.fitToPage = true;
    worksheet.pageSetup.fitToWidth = 1;
    worksheet.pageSetup.fitToHeight = 0;
    worksheet.pageSetup.printTitlesRow = `${HEADER_ROW}:${HEADER_ROW}`;
    worksheet.headerFooter = { oddFooter: "&CPágina &P de &N", evenFooter: "&CPágina &P de &N" };

    const filename = `pecas-${saoPauloDateStamp(now)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  })
);
