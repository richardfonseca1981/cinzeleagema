// Códigos ISO 3166-1 alpha-2 (249 oficialmente atribuídos). Os nomes vêm de
// Intl.DisplayNames no idioma ativo — nenhuma biblioteca nem lista de nomes.
export const DEFAULT_COUNTRY = "BR";

export const COUNTRY_CODES: readonly string[] = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO " +
  "FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE " +
  "JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO " +
  "MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW " +
  "PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM " +
  "TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

export interface CountryOption {
  code: string;
  name: string;
}

function toIntlLocale(lang: string): string {
  return lang === "en" ? "en" : "pt-BR";
}

export function countryName(code: string, lang: string): string {
  try {
    return new Intl.DisplayNames([toIntlLocale(lang)], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

// Brasil sempre primeiro; os demais em ordem alfabética no idioma ativo.
export function listCountries(lang: string): CountryOption[] {
  const locale = toIntlLocale(lang);
  const collator = new Intl.Collator(locale);
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const others = COUNTRY_CODES.filter((code) => code !== DEFAULT_COUNTRY)
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => collator.compare(a.name, b.name));
  return [{ code: DEFAULT_COUNTRY, name: names.of(DEFAULT_COUNTRY) ?? DEFAULT_COUNTRY }, ...others];
}
