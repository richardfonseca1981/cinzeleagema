// Assinatura do carrinho: ids e quantidades, independente da ordem dos itens.
// Uma cotação só vale para a assinatura com que foi feita.
export function cartSignature(items: ReadonlyArray<{ productId: string; quantity: number }>): string {
  return [...items]
    .map((i) => `${i.productId}:${i.quantity}`)
    .sort()
    .join("|");
}
