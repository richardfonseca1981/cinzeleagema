-- AlterTable
ALTER TABLE "Product" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: preserva a ordem atual do site (mais novo primeiro, desempate por id desc).
UPDATE "Product" p
SET "sortOrder" = r.rn
FROM (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY "createdAt" DESC, id DESC) - 1)::int AS rn
  FROM "Product"
) r
WHERE p.id = r.id;

-- CreateIndex
CREATE INDEX "Product_sortOrder_idx" ON "Product"("sortOrder");
