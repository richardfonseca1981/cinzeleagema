import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/lib/env";

export async function cleanDatabase() {
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.adminUser.deleteMany();
}

export function generateTestToken(overrides: Partial<{ sub: string; email: string; role: string }> = {}) {
  return jwt.sign(
    { sub: overrides.sub ?? "test-admin-id", email: overrides.email ?? "admin@test.com", role: overrides.role ?? "admin" },
    env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}
