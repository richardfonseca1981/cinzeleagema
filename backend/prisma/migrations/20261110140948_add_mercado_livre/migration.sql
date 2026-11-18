-- CreateTable
CREATE TABLE "MercadoLivreAccount" (
    "id" TEXT NOT NULL,
    "mlUserId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoLivreAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MercadoLivreListing" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mlItemId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "permalink" TEXT,
    "categoryId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoLivreListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MercadoLivreAccount_mlUserId_key" ON "MercadoLivreAccount"("mlUserId");

-- CreateIndex
CREATE INDEX "MercadoLivreListing_accountId_idx" ON "MercadoLivreListing"("accountId");

-- CreateIndex
CREATE INDEX "MercadoLivreListing_productId_idx" ON "MercadoLivreListing"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "MercadoLivreListing_accountId_productId_key" ON "MercadoLivreListing"("accountId", "productId");

-- AddForeignKey
ALTER TABLE "MercadoLivreListing" ADD CONSTRAINT "MercadoLivreListing_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MercadoLivreAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MercadoLivreListing" ADD CONSTRAINT "MercadoLivreListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
