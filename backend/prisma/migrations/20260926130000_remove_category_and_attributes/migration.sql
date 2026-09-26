-- Remove o sistema de Category + attributes/attributeSchema: o cliente
-- (Felipe) simplificou o cadastro de peça para campos fixos, sem
-- diferenciação de campos técnicos por tipo de pedra. Produtos existentes
-- perdem categoria/atributos — aceito e confirmado antes de aplicar.

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";

-- DropIndex
DROP INDEX "Product_categoryId_idx";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "categoryId";
ALTER TABLE "Product" DROP COLUMN "attributes";

-- DropTable
DROP TABLE "Category";
