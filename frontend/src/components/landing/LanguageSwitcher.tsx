import { useTranslation } from "react-i18next";
import { setLanguage, type SupportedLanguage } from "../../i18n";

// Bandeiras simples em SVG inline — emoji de bandeira não renderiza no
// Windows (vira texto tipo "BR"/"US" ou some). Não precisam ser oficiais,
// só reconhecíveis.
function BrazilFlagIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
      <rect width="24" height="16" fill="#009C3B" />
      <polygon points="12,2 22,8 12,14 2,8" fill="#FFDF00" />
      <circle cx="12" cy="8" r="3.2" fill="#002776" />
    </svg>
  );
}

function UsaFlagIcon({ className = "" }: { className?: string }) {
  const stripeHeight = 16 / 7;
  return (
    <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
      <rect width="24" height="16" fill="#FFFFFF" />
      {[0, 2, 4, 6].map((i) => (
        <rect key={i} x="0" y={i * stripeHeight} width="24" height={stripeHeight} fill="#B22234" />
      ))}
      <rect width="10" height={stripeHeight * 4} fill="#3C3B6E" />
    </svg>
  );
}

const LANGUAGE_OPTIONS: {
  code: SupportedLanguage;
  Flag: typeof BrazilFlagIcon;
  ariaLabel: string;
}[] = [
  { code: "pt-BR", Flag: BrazilFlagIcon, ariaLabel: "Mudar para português" },
  { code: "en", Flag: UsaFlagIcon, ariaLabel: "Switch to English" },
];

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n } = useTranslation();

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {LANGUAGE_OPTIONS.map(({ code, Flag, ariaLabel }) => {
        const active = i18n.language === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLanguage(code)}
            aria-label={ariaLabel}
            aria-pressed={active}
            className={`rounded-sm transition ${
              active
                ? "opacity-100 ring-2 ring-[#C78F50] ring-offset-1 ring-offset-[#010B1A]"
                : "opacity-50 hover:opacity-80"
            }`}
          >
            <Flag className="h-4 w-6 rounded-[2px]" />
          </button>
        );
      })}
    </div>
  );
}
