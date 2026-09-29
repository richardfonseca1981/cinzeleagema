// i18n usa "pt-BR"/"en" como código de idioma; para formatação de número o
// Intl precisa de uma locale completa ("en" sozinho já funciona, mas "en-US"
// é mais explícito sobre o padrão de separador usado). Qualquer valor que
// não seja "en" cai no padrão pt-BR.
function toIntlLocale(lang: string): string {
  return lang === "en" ? "en-US" : "pt-BR";
}

export function formatPrice(value: string | number, lang: string = "pt-BR") {
  // A moeda continua Real (BRL) nos dois idiomas — só o idioma da interface
  // muda, não a moeda em que a peça é vendida.
  return Number(value).toLocaleString(toIntlLocale(lang), { style: "currency", currency: "BRL" });
}

// Retorna null quando não há peso nem tamanho válidos (produto incompleto) —
// nesse caso o card/detalhe simplesmente não mostra a linha, em vez de "0g · 0cm".
export function formatWeightSize(
  weightGrams: string | number,
  sizeCm: string | number,
  lang: string = "pt-BR"
): string | null {
  const locale = toIntlLocale(lang);
  const grams = Number(weightGrams);
  const cm = Number(sizeCm);

  // Pedras lapidadas pesam frações de grama; peças bruta/big podem passar de
  // 1kg. Convertendo tudo para kg com 3 casas, as primeiras arredondam para
  // "0,000kg" — por isso a unidade se adapta à magnitude do peso.
  const weightLabel =
    grams > 0
      ? grams >= 1000
        ? `${(grams / 1000).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}kg`
        : `${grams.toLocaleString(locale, { maximumFractionDigits: 2 })}g`
      : null;

  const sizeLabel = cm > 0 ? `${cm.toLocaleString(locale, { maximumFractionDigits: 1 })}cm` : null;

  if (!weightLabel && !sizeLabel) return null;
  return [weightLabel, sizeLabel].filter(Boolean).join(" · ");
}
