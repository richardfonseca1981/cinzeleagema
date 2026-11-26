-- Migration aditiva: tabela nova (AdminActionLog), nenhuma coluna/tabela
-- existente é alterada, renomeada ou removida.

-- CreateTable
CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminUsername" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminActionLog_action_createdAt_idx" ON "AdminActionLog"("action", "createdAt");
