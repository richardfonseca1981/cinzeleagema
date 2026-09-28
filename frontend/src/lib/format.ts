export function formatPrice(value: string | number) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Retorna null quando não há peso nem tamanho válidos (produto incompleto) —
// nesse caso o card/detalhe simplesmente não mostra a linha, em vez de "0g · 0cm".
export function formatWeightSize(weightGrams: string | number, sizeCm: string | number): string | null {
  const grams = Number(weightGrams);
  const cm = Number(sizeCm);

  // Pedras lapidadas pesam frações de grama; peças bruta/big podem passar de
  // 1kg. Convertendo tudo para kg com 3 casas, as primeiras arredondam para
  // "0,000kg" — por isso a unidade se adapta à magnitude do peso.
  const weightLabel =
    grams > 0
      ? grams >= 1000
        ? `${(grams / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}kg`
        : `${grams.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}g`
      : null;

  const sizeLabel = cm > 0 ? `${cm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}cm` : null;

  if (!weightLabel && !sizeLabel) return null;
  return [weightLabel, sizeLabel].filter(Boolean).join(" · ");
}
