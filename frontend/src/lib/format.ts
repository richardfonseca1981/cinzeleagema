export function formatPrice(value: string | number) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatWeightSize(weightGrams: string | number, sizeCm: string | number) {
  const grams = Number(weightGrams);
  // Pedras lapidadas pesam frações de grama; peças bruta/big podem passar de
  // 1kg. Convertendo tudo para kg com 3 casas, as primeiras arredondam para
  // "0,000kg" — por isso a unidade se adapta à magnitude do peso.
  const weightLabel =
    grams >= 1000
      ? `${(grams / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}kg`
      : `${grams.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}g`;
  const cmFormatted = Number(sizeCm).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${weightLabel} · ${cmFormatted}cm`;
}
