import { useTranslation } from "react-i18next";
import { setLanguage, type SupportedLanguage } from "../../i18n";

const LANGUAGE_OPTIONS: { code: SupportedLanguage; flag: string }[] = [
  { code: "pt-BR", flag: "🇧🇷" },
  { code: "en", flag: "🇺🇸" },
];

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { t, i18n } = useTranslation();

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {LANGUAGE_OPTIONS.map((option) => {
        const active = i18n.language === option.code;
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => setLanguage(option.code)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition ${
              active ? "bg-[#EFF6FF] text-[#1B3A6B]" : "text-[#64748B] hover:text-[#1B3A6B]"
            }`}
          >
            <span aria-hidden="true">{option.flag}</span>
            {t(`languageSwitcher.${option.code === "pt-BR" ? "pt" : "en"}`)}
          </button>
        );
      })}
    </div>
  );
}
