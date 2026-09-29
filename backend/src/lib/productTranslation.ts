import { prisma } from "./prisma";
import { translateProductText } from "./claude";

// Traduz e já salva nameEn/descriptionEn no produto. Retorna o produto
// atualizado, ou null quando a tradução não pôde ser obtida (chave ausente,
// erro de rede etc.) — nesse caso o chamador simplesmente não atualiza nada,
// e o produto segue com nameEn/descriptionEn como estavam (normalmente null).
export async function translateAndSaveProduct(productId: string, name: string, description: string | null) {
  const translation = await translateProductText(name, description);
  if (!translation) return null;

  return prisma.product.update({
    where: { id: productId },
    data: { nameEn: translation.nameEn, descriptionEn: translation.descriptionEn },
  });
}

// Dispara a tradução sem bloquear quem chamou (fire-and-forget) — usado logo
// após criar/editar um produto, quando a resposta HTTP já foi enviada.
export function translateProductInBackground(productId: string, name: string, description: string | null) {
  translateAndSaveProduct(productId, name, description).catch((err) => {
    console.error(`Falha ao salvar tradução automática do produto ${productId}:`, err);
  });
}
