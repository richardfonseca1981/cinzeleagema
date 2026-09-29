import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ptBR from "./locales/pt-BR.json";
import en from "./locales/en.json";

export const SUPPORTED_LANGUAGES = ["pt-BR", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = "cinzeleagema_locale";

function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function getInitialLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isSupportedLanguage(stored)) return stored;
  } catch {
    // localStorage indisponível (modo privado etc.) — usa o padrão
  }
  // Padrão é sempre PT-BR, mesmo com o navegador em outro idioma — não
  // detectamos automaticamente para não mostrar inglês a um brasileiro só
  // porque o navegador dele está configurado em inglês.
  return "pt-BR";
}

i18n.use(initReactI18next).init({
  resources: {
    "pt-BR": { translation: ptBR },
    en: { translation: en },
  },
  lng: getInitialLanguage(),
  fallbackLng: "pt-BR",
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: SupportedLanguage) {
  i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // localStorage indisponível — a troca de idioma funciona, só não persiste
  }
}

export default i18n;
