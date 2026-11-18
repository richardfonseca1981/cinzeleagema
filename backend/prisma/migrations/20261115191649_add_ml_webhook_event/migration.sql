-- CreateTable
CREATE TABLE "MercadoLivreWebhookEvent" (
    "id" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "resource" TEXT,
    "topic" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "MercadoLivreWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MercadoLivreWebhookEvent_bodyHash_key" ON "MercadoLivreWebhookEvent"("bodyHash");

-- CreateIndex
CREATE INDEX "MercadoLivreWebhookEvent_resource_idx" ON "MercadoLivreWebhookEvent"("resource");
