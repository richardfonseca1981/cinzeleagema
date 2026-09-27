-- AlterTable: ordem de exibição fixa de categorias/subcategorias (definida pelo cliente, só o seed altera)
ALTER TABLE "Category" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subcategory" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
