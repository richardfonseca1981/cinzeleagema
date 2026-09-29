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

const GRAMS_PER_OUNCE = 0.035274;
const INCHES_PER_CM = 0.393701;

export function gramsToOunces(grams: number): number {
  return Math.round(grams * GRAMS_PER_OUNCE * 100) / 100;
}

export function cmToInches(cm: number): number {
  return Math.round(cm * INCHES_PER_CM * 100) / 100;
}

// Retorna null quando não há peso nem tamanho válidos (produto incompleto) —
// nesse caso o card/detalhe simplesmente não mostra a linha, em vez de "0g · 0cm".
// O banco sempre guarda em gramas/centímetros (fonte de verdade, usada no
// admin); a conversão para onças/polegadas em EN é só de exibição.
export function formatWeightSize(
  weightGrams: string | number,
  sizeCm: string | number,
  lang: string = "pt-BR"
): string | null {
  const locale = toIntlLocale(lang);
  const grams = Number(weightGrams);
  const cm = Number(sizeCm);

  if (lang === "en") {
    const weightLabel = grams > 0 ? `${gramsToOunces(grams).toLocaleString(locale, { maximumFractionDigits: 2 })}oz` : null;
    const sizeLabel = cm > 0 ? `${cmToInches(cm).toLocaleString(locale, { maximumFractionDigits: 2 })}in` : null;
    if (!weightLabel && !sizeLabel) return null;
    return [weightLabel, sizeLabel].filter(Boolean).join(" · ");
  }

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

// Fallback para português sempre que a tradução (EN) estiver ausente/vazia —
// nunca mostra vazio no site público.
export function localizeText(pt: string, en: string | null | undefined, lang: string): string {
  return lang === "en" && en ? en : pt;
}
