// Preço grande do PDF é desenhado em 3 partes (símbolo pequeno + inteiro
// grande em negrito + centavos pequenos — ver REFERÊNCIA DE FORMATO), por
// isso a formatação devolve as partes já separadas em vez de uma string
// única. Decimal null = "Consulte o valor"/"Price on request" (ver
// PriceDisplay | null abaixo), tratado pelo chamador no lugar do bloco grande.

export interface PriceParts {
  symbol: string;
  // Parte inteira já com separador de milhar da locale (ponto em PT, vírgula
  // em EN), sem o símbolo da moeda.
  integer: string;
  // Duas casas decimais, sem o separador (o chamador desenha o "," ou "."
  // junto do tamanho de fonte pequeno).
  decimals: string;
  decimalSeparator: string;
}

function splitAmount(amount: number, locale: "pt-BR" | "en-US"): { integer: string; decimals: string; decimalSeparator: string } {
  // Math.round evita sobra de ponto flutuante (ex.: 10.1 * 100 = 1009.99...).
  const cents = Math.round(amount * 100);
  const [intPart, decPart] = (cents / 100).toFixed(2).split(".");
  const integer = Math.abs(Number(intPart)).toLocaleString(locale, { maximumFractionDigits: 0 });
  return { integer, decimals: decPart, decimalSeparator: locale === "pt-BR" ? "," : "." };
}

// PT: preço sempre em Real, direto do valor cadastrado.
export function formatPricePtParts(value: number): PriceParts {
  const { integer, decimals, decimalSeparator } = splitAmount(value, "pt-BR");
  return { symbol: "R$", integer, decimals, decimalSeparator };
}

// EN: mesma regra do site público (ver frontend/src/lib/format.ts
// formatPrice) — converte para USD pela cotação do dia; sem cotação
// disponível, cai de volta para BRL em vez de travar a geração do PDF.
export function formatPriceEnParts(valueBRL: number, exchangeRate: number | null): PriceParts {
  if (exchangeRate && exchangeRate > 0) {
    const { integer, decimals, decimalSeparator } = splitAmount(valueBRL / exchangeRate, "en-US");
    return { symbol: "$", integer, decimals, decimalSeparator };
  }
  const { integer, decimals, decimalSeparator } = splitAmount(valueBRL, "pt-BR");
  return { symbol: "R$", integer, decimals, decimalSeparator };
}

export function formatPriceParts(valueBRL: number, language: "pt" | "en", exchangeRate: number | null): PriceParts {
  return language === "en" ? formatPriceEnParts(valueBRL, exchangeRate) : formatPricePtParts(valueBRL);
}
