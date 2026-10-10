// i18n usa "pt-BR"/"en" como código de idioma; para formatação de número o
// Intl precisa de uma locale completa ("en" sozinho já funciona, mas "en-US"
// é mais explícito sobre o padrão de separador usado). Qualquer valor que
// não seja "en" cai no padrão pt-BR.
function toIntlLocale(lang: string): string {
  return lang === "en" ? "en-US" : "pt-BR";
}

// O preço é sempre CADASTRADO em Real (fonte de verdade, usada no admin).
// Em PT, exibe direto em BRL. Em EN, converte para USD usando a cotação do
// dia (buscada uma vez por sessão via ExchangeRateProvider/useExchangeRate)
// — se a cotação não estiver disponível (ainda carregando, API fora do ar),
// cai de volta para BRL em vez de travar a exibição do preço.
export function formatPrice(value: string | number, lang: string = "pt-BR", exchangeRate?: number | null) {
  const amount = Number(value);

  if (lang === "en" && exchangeRate && exchangeRate > 0) {
    return (amount / exchangeRate).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  return amount.toLocaleString(toIntlLocale(lang), { style: "currency", currency: "BRL" });
}

// Retorna null quando não há peso nem tamanho válidos (produto incompleto) —
// nesse caso o card/detalhe simplesmente não mostra a linha, em vez de "0g · 0cm".
// O banco sempre guarda em gramas/centímetros (fonte de verdade, usada no
// admin) e a exibição pública usa o mesmo sistema métrico nos dois idiomas —
// EN não converte para onças/polegadas (sistema imperial só faz sentido para
// público dos EUA; o resto do mundo, incluindo a Europa, usa métrico). Só o
// separador decimal muda por locale (vírgula em PT, ponto em EN), igual ao
// formatPrice acima.
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

// Fallback para português sempre que a tradução (EN) estiver ausente/vazia —
// nunca mostra vazio no site público.
export function localizeText(pt: string, en: string | null | undefined, lang: string): string {
  return lang === "en" && en ? en : pt;
}

// Nome a exibir de uma peça/item de carrinho sem nome cadastrado: cai para o
// SKU (já é neutro entre idiomas) e, sem nenhum dos dois, para o texto fixo
// "Peça sem nome"/"Unnamed piece" (chave i18n). Nome presente continua
// usando localizeText (PT/EN) como antes — nada muda para peças já completas.
export function localizeProductName(
  item: { name: string | null; nameEn?: string | null; sku?: string | null },
  lang: string,
  t: (key: string) => string
): string {
  const pt = item.name?.trim();
  if (pt) return localizeText(pt, item.nameEn ?? null, lang);

  const sku = item.sku?.trim();
  if (sku) return sku;

  return t("productCard.unnamed");
}

// Nome de categoria/subcategoria: lista fixa e pequena, traduzida de forma
// estática em locales/en.json (chave categoryNames.<nome em PT>) — sem IA,
// diferente do nome/descrição de produto. `t` já resolve pelo idioma ativo;
// nomes sem entrada no mapa (ou idioma PT, que não tem esse bloco) caem no
// defaultValue, ou seja, no próprio nome em português.
export function localizeCategoryName(t: (key: string, options?: Record<string, unknown>) => string, name: string): string {
  return t(`categoryNames.${name}`, { defaultValue: name });
}
