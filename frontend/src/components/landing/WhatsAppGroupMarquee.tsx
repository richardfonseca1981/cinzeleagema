import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon, WhatsAppIcon } from "./icons";
import { WHATSAPP_GROUP_URL } from "../../lib/whatsappGroup";

// "Fechar" vale só para a aba/sessão atual (sessionStorage) — reaparece numa
// sessão nova. Guardado em try/catch: sem storage disponível (modo privado
// etc.), a barra simplesmente não lembra o fechamento, mas o clique de
// fechar continua funcionando normalmente.
const SESSION_STORAGE_KEY = "cinzeleagema_whatsapp_marquee_closed";

function readClosedFromSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistClosedToSession(): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, "1");
  } catch {
    // sessionStorage indisponível — a barra some só nesta renderização.
  }
}

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

export function WhatsAppGroupMarquee() {
  const { t } = useTranslation();
  const [closed, setClosed] = useState(readClosedFromSession);
  const reducedMotion = usePrefersReducedMotion();

  if (closed) return null;

  const message = t("whatsappGroup.marqueeMessage");

  function handleClose() {
    persistClosedToSession();
    setClosed(true);
  }

  return (
    <div className="group relative flex h-9 items-center bg-[#C78F50] text-[#010B1A] sm:h-10" data-testid="whatsapp-group-marquee">
      <a
        href={WHATSAPP_GROUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("whatsappGroup.marqueeAriaLabel")}
        className="absolute inset-0 flex items-center overflow-hidden pr-9"
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
      <button
        type="button"
        onClick={handleClose}
        aria-label={t("whatsappGroup.marqueeCloseAriaLabel")}
        className="relative z-10 ml-auto flex h-full w-9 flex-shrink-0 items-center justify-center text-[#010B1A]/70 transition hover:text-[#010B1A]"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
