-- AlterTable: adiciona peso (gramas) e tamanho (centímetros) como campos
-- fixos do produto — se aplicam a qualquer peça, independente da categoria.
-- Default 0 evita quebrar produtos já cadastrados; o cadastro via admin
-- passa a exigir um valor real para esses campos a partir de agora.
ALTER TABLE "Product" ADD COLUMN "weightGrams" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "sizeCm" DECIMAL(10,2) NOT NULL DEFAULT 0;
