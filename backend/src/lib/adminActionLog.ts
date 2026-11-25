import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

// Log de auditoria genérico das ações administrativas da tela de
// categorização (ver schema.prisma AdminActionLog) — uma função só para
// gravar, reaproveitada por qualquer ação (mover em lote, criar/renomear/
// apagar categoria/subcategoria). `tx` aceita o client de uma transação em
// andamento (Prisma.TransactionClient) para a gravação do log fazer parte da
// MESMA transação da ação que ela registra — nunca um log "órfão" de uma
// ação que falhou, nem uma ação sem log por falha na gravação.
export interface AdminActor {
  id: string;
  username: string;
}

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export async function recordAdminAction(
  client: PrismaOrTx,
  actor: AdminActor,
  action: string,
  payload: Record<string, unknown>
): Promise<void> {
  await client.adminActionLog.create({
    data: { adminId: actor.id, adminUsername: actor.username, action, payload: payload as unknown as Prisma.InputJsonValue },
  });
}

// Entrada mais recente de um tipo de ação — usado pelo "Desfazer" (só o
// último nível, mesmo princípio já usado no projeto para desfazer tratamento
// de foto, ver ProductImage.previousUrl/Key).
export async function getLastAction(action: string) {
  return prisma.adminActionLog.findFirst({ where: { action }, orderBy: { createdAt: "desc" } });
}
