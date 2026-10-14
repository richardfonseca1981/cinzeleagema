// Confirmação de exclusão definitiva da peça: o admin digita o SKU (ou, se a
// peça não tem SKU, o nome — ou "(sem nome)", mesmo texto mostrado na lista,
// quando a peça não tem nome nem SKU) e só então o botão habilita.
export function deleteConfirmTarget(product: { sku?: string | null; name: string | null }): { label: "SKU" | "nome"; value: string } {
  const sku = product.sku?.trim();
  if (sku) return { label: "SKU", value: sku };
  return { label: "nome", value: product.name?.trim() || "(sem nome)" };
}

export function canConfirmDelete(typed: string, target: { value: string }): boolean {
  return target.value.length > 0 && typed.trim() === target.value;
}
