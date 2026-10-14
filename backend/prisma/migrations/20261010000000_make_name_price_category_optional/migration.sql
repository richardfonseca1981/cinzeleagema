-- Migration aditiva: remove NOT NULL de name, price e categoryId em Product.
-- Nenhum DROP/RENAME de coluna, nenhum UPDATE de dado — as 76 peças reais
-- existentes continuam com os mesmos valores, só a restrição fica mais
-- permissiva para cadastros futuros sem esses campos.

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "categoryId" DROP NOT NULL,
ALTER COLUMN "price" DROP NOT NULL;

-- AddForeignKey
-- ON DELETE SET NULL (em vez do padrão RESTRICT): categoryId agora pode ser
-- null, então uma eventual exclusão de categoria (não há UI para isso hoje)
-- desvincula a peça em vez de falhar. Mesmo comportamento de FK, só mais
-- permissivo — não há UPDATE/DELETE de dados aqui.
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
