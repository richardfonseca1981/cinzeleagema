-- AlterTable: adiciona username sem quebrar dados existentes.
-- Para qualquer AdminUser já cadastrado, deriva um username a partir da
-- parte antes do "@" do email; em caso de colisão, sufixa com um contador.
ALTER TABLE "AdminUser" ADD COLUMN "username" TEXT;

WITH ranked AS (
  SELECT
    id,
    split_part(email, '@', 1) AS base,
    ROW_NUMBER() OVER (PARTITION BY split_part(email, '@', 1) ORDER BY "createdAt") AS rn
  FROM "AdminUser"
)
UPDATE "AdminUser" a
SET "username" = CASE WHEN r.rn = 1 THEN r.base ELSE r.base || '-' || r.rn END
FROM ranked r
WHERE a.id = r.id;

ALTER TABLE "AdminUser" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");
