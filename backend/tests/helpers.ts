import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/lib/env";

export async function cleanDatabase() {
  await prisma.shippingRate.deleteMany();
  await prisma.shippingZone.deleteMany();
  // Fase 1B etapa 8 — faltava aqui desde a Etapa 1 (a tabela só existia como
  // fundação, nenhum teste gravava nela de verdade até o webhook existir):
  // sem isso, eventos de um teste vazavam pro próximo dentro do mesmo
  // arquivo (dedup por bodyHash cruzando testes, contagens erradas).
  await prisma.mercadoLivreWebhookEvent.deleteMany();
  await prisma.mercadoLivreListing.deleteMany();
  await prisma.mercadoLivreAccount.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.adminUser.deleteMany();
}

export function generateTestToken(overrides: Partial<{ sub: string; username: string; role: string }> = {}) {
  return jwt.sign(
    { sub: overrides.sub ?? "test-admin-id", username: overrides.username ?? "admin", role: overrides.role ?? "admin" },
    env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}
