-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "colorEnhanced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "colorEnhanceLevel" TEXT,
ADD COLUMN     "previousColorEnhanced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "previousColorEnhanceLevel" TEXT;
