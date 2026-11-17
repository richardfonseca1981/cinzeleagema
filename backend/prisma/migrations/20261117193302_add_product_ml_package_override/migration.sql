-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "mlPackageOverrideHeightCm" DECIMAL(10,2),
ADD COLUMN     "mlPackageOverrideLengthCm" DECIMAL(10,2),
ADD COLUMN     "mlPackageOverrideWeightG" DECIMAL(10,2),
ADD COLUMN     "mlPackageOverrideWidthCm" DECIMAL(10,2);
