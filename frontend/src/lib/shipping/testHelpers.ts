import i18next, { type TFunction } from "i18next";
import en from "../../locales/en.json";
import ptBR from "../../locales/pt-BR.json";

// Só para testes: instância i18next com os arquivos de idioma REAIS.
export async function makeT(lng: "pt-BR" | "en"): Promise<TFunction> {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng,
    resources: { en: { translation: en }, "pt-BR": { translation: ptBR } },
    fallbackLng: false,
    interpolation: { escapeValue: false },
  });
  return i18n.t.bind(i18n) as TFunction;
}

export const locales = { en, ptBR } as const;

// Todas as chaves-folha de um objeto, em "a.b.c" (plurais _one/_other contam como folhas).
export function leafKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k));
}
