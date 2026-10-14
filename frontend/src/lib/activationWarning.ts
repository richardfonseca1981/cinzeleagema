// PARTE 3 (campos opcionais): ativar ou salvar uma peça ATIVA sem nome, preço
// ou foto precisa de confirmação explícita no admin (não bloqueia, só avisa)
// — usado tanto no salvar do ProductForm quanto no botão "Ativar" da lista.
interface ProductEssentials {
  name: string | null;
  price: string | number | null;
  hasPhoto: boolean;
}

export function isMissingKeyFields(product: ProductEssentials): boolean {
  return !product.name?.trim() || product.price === null || !product.hasPhoto;
}

export function shouldWarnOnActivate(active: boolean, product: ProductEssentials): boolean {
  return active && isMissingKeyFields(product);
}
