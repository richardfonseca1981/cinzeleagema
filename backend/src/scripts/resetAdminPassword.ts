import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

// Reset de senha direto no banco, para uso em produção enquanto não existe
// tela de "esqueci minha senha" no painel. Ex: npm run reset-password -w backend -- admin novaSenha123
async function main() {
  const [username, newPassword] = process.argv.slice(2);

  if (!username || !newPassword) {
    console.error("Uso: npm run reset-password -w backend -- <username> <nova-senha>");
    process.exit(1);
  }

  const admin = await prisma.adminUser.findUnique({ where: { username } });
  if (!admin) {
    throw new Error(`Admin com username "${username}" não encontrado.`);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.adminUser.update({
    where: { username },
    data: { passwordHash },
  });

  console.log(`Senha atualizada com sucesso para o usuário "${username}".`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
