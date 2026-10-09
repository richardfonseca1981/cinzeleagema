// Confirmação de exclusão definitiva da peça: o admin digita o SKU (ou, se a
// peça não tem SKU, o nome) e só então o botão habilita.
export function deleteConfirmTarget(product: { sku?: string | null; name: string }): { label: "SKU" | "nome"; value: string } {
  const sku = product.sku?.trim();
  return sku ? { label: "SKU", value: sku } : { label: "nome", value: product.name.trim() };
}

export function canConfirmDelete(typed: string, target: { value: string }): boolean {
  return target.value.length > 0 && typed.trim() === target.value;
}
