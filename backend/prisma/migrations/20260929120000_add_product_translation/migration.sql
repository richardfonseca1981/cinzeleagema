-- AlterTable: tradução automática (Claude) do nome/descrição do produto para inglês
ALTER TABLE "Product" ADD COLUMN "nameEn" TEXT;
ALTER TABLE "Product" ADD COLUMN "descriptionEn" TEXT;
