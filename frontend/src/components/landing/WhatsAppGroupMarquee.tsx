import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { WhatsAppIcon } from "./icons";
import { WHATSAPP_GROUP_URL } from "../../lib/whatsappGroup";

// prefers-reduced-motion é lido em JS (não só via CSS) para remover a cópia
// duplicada do DOM por completo quando reduzido — ela existe apenas para a
// rolagem contínua (ver tailwind.config.js), então deixá-la no DOM sem
// animação mostraria o texto repetido lado a lado.
function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(query);
    } catch {
      return;
    }
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

// Sempre visível em toda página pública — sem botão de fechar (decisão do
// Felipe). A tarja inteira é o link do grupo.
export function WhatsAppGroupMarquee() {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();

  const message = t("whatsappGroup.marqueeMessage");

  return (
    <div className="group relative flex h-9 items-center bg-[#C78F50] text-[#010B1A] sm:h-10" data-testid="whatsapp-group-marquee">
      <a
        href={WHATSAPP_GROUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("whatsappGroup.marqueeAriaLabel")}
        className="absolute inset-0 flex items-center overflow-hidden"
      >
        {reducedMotion ? (
          <span className="flex w-full items-center justify-center gap-2 whitespace-nowrap px-4 text-xs font-semibold sm:text-sm">
            <WhatsAppIcon className="h-4 w-4 flex-shrink-0" />
            {message}
          </span>
        ) : (
          <div className="flex w-max animate-marquee whitespace-nowrap group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]">
            <span className="flex items-center gap-2 px-4 text-xs font-semibold sm:text-sm">
              <WhatsAppIcon className="h-4 w-4 flex-shrink-0" />
              {message}
            </span>
            {/* Cópia para o loop ficar contínuo — mesmo conteúdo, nunca lido pelo leitor de tela. */}
            <span aria-hidden="true" className="flex items-center gap-2 px-4 text-xs font-semibold sm:text-sm">
              <WhatsAppIcon className="h-4 w-4 flex-shrink-0" />
              {message}
            </span>
          </div>
        )}
      </a>
    </div>
  );
}
