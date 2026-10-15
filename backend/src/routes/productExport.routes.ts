import { Router } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const productExportRouter = Router();

// Qualquer app de planilha (Excel, Google Sheets, LibreOffice) pode interpretar
// um valor começado em =, +, - ou @ como fórmula. Os campos de texto aqui são
// digitados por humanos (nome, descrição, SKU) e podem começar com esses
// caracteres sem intenção maliciosa nenhuma — mas também é a porta clássica de
// "CSV/formula injection" se o arquivo for reaberto por outra ferramenta.
// Prefixar com apóstrofo é a mitigação padrão: a célula vira texto literal e a
// maioria das planilhas some com o apóstrofo na exibição.
const FORMULA_LEADING_CHARS = new Set(["=", "+", "-", "@"]);
function sanitizeCell(value: string): string {
  return FORMULA_LEADING_CHARS.has(value[0]) ? `'${value}` : value;
}

// null vira string vazia (célula em branco); string passa pela sanitização acima.
function sanitizeNullableCell(value: string | null): string | null {
  return value === null ? null : sanitizeCell(value);
}

function buildFilename(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `pecas-${today}.xlsx`;
}

// GET /api/admin/products/export — autenticado (mesmo middleware do admin).
// Exporta TODOS os produtos (ativos e inativos), sem paginação nem filtro da
// tela, com todos os campos próprios e das relações (categoria/subcategoria,
// fotos). Pensado para ser aberto fora do sistema (planilha de conferência,
// backup manual) — por isso mostra os valores crus do banco (peso/tamanho em
// 0 aparecem como 0, não como "—"; essa tradução de exibição é só da tela do
// admin, ver lib/adminProductFormat.ts no frontend).
productExportRouter.get(
  "/export",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const products = await prisma.product.findMany({
      include: { images: { orderBy: { position: "asc" } }, category: true, subcategory: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Peças");

    worksheet.columns = [
      { header: "ID", key: "id", width: 26 },
      { header: "SKU", key: "sku", width: 18 },
      { header: "Nome", key: "name", width: 32 },
      { header: "Descrição", key: "description", width: 44 },
      { header: "Nome (EN)", key: "nameEn", width: 32 },
      { header: "Descrição (EN)", key: "descriptionEn", width: 44 },
      { header: "Categoria", key: "categoryLabel", width: 30 },
      { header: "Preço de venda (R$)", key: "price", width: 18 },
      { header: "Peso (g)", key: "weightGrams", width: 12 },
      { header: "Tamanho (cm)", key: "sizeCm", width: 14 },
      { header: "Controla estoque", key: "trackStock", width: 16 },
      { header: "Quantidade em estoque", key: "stockQty", width: 20 },
      { header: "Ativo", key: "active", width: 10 },
      { header: "Fotos (URLs)", key: "photoUrls", width: 60 },
      { header: "Criado em", key: "createdAt", width: 20 },
      { header: "Atualizado em", key: "updatedAt", width: 20 },
    ];

    worksheet.getRow(1).font = { bold: true };
    // Cabeçalho sempre visível ao rolar — pedido explícito da tarefa.
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const product of products) {
      const categoryLabel = [product.category?.name, product.subcategory?.name].filter(Boolean).join(", ");
      const photoUrls = product.images.map((image) => image.url).join(", ");

      worksheet.addRow({
        id: sanitizeCell(product.id),
        sku: sanitizeNullableCell(product.sku),
        name: sanitizeNullableCell(product.name),
        description: sanitizeNullableCell(product.description),
        nameEn: sanitizeNullableCell(product.nameEn),
        descriptionEn: sanitizeNullableCell(product.descriptionEn),
        categoryLabel: categoryLabel ? sanitizeCell(categoryLabel) : null,
        price: product.price !== null ? Number(product.price) : null,
        weightGrams: Number(product.weightGrams),
        sizeCm: Number(product.sizeCm),
        trackStock: product.trackStock ? "Sim" : "Não",
        stockQty: product.stockQty,
        active: product.active ? "Sim" : "Não",
        photoUrls: photoUrls ? sanitizeCell(photoUrls) : null,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      });
    }

    worksheet.getColumn("price").numFmt = '"R$" #,##0.00';
    worksheet.getColumn("weightGrams").numFmt = "0.00";
    worksheet.getColumn("sizeCm").numFmt = "0.0";
    worksheet.getColumn("stockQty").numFmt = "0";
    worksheet.getColumn("createdAt").numFmt = "dd/mm/yyyy hh:mm";
    worksheet.getColumn("updatedAt").numFmt = "dd/mm/yyyy hh:mm";

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${buildFilename()}"`);

    await workbook.xlsx.write(res);
    res.end();
  })
);
