import type { Product, ProductImage } from "../types";

// Foto principal (capa) de uma linha da lista — tolera `images` ausente
// (resposta de rota que não devolveu as fotos) sem derrubar a tela.
export function coverImage(product: Pick<Product, "images">): ProductImage | undefined {
  return product.images?.[0];
}

// Troca a linha pela peça atualizada SEM perder campos que a resposta não
// trouxe (ex.: fotos, categoria): o que vier preenche, o que faltar fica.
export function mergeUpdatedProduct(items: Product[], updated: Partial<Product> & { id: string }): Product[] {
  return items.map((p) => {
    if (p.id !== updated.id) return p;
    const defined = Object.fromEntries(Object.entries(updated).filter(([, v]) => v !== undefined));
    return { ...p, ...defined } as Product;
  });
}
