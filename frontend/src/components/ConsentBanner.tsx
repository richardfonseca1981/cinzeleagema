import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isAdminPath } from "../lib/analytics";
import { useConsent } from "../lib/consent";

// Dois botões com o MESMO destaque visual de propósito (ver decisão do
// usuário em CONTEXT.md "SEO — Rodada 3") — nenhum dos dois é "primário",
// pra não induzir ao aceite. Nunca aparece em /admin (mesma regra de
// isAdminPath do analytics — admin nunca é medido, não precisa escolher nada).
const buttonClass =
  "rounded-lg border border-[#C78F50] px-4 py-2 text-sm font-semibold text-[#C78F50] transition hover:bg-[#C78F50]/10";

export function ConsentBanner() {
  const { t } = useTranslation();
  const location = useLocation();
  const { bannerOpen, accept, reject } = useConsent();

  if (!bannerOpen || isAdminPath(location.pathname)) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("consent.title")}
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-[#E2E8F0] bg-white px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#1A1A1A]">
          {t("consent.message")}{" "}
          <Link to="/privacidade" className="font-medium text-[#C78F50] underline underline-offset-2">
            {t("consent.learnMore")}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={reject} className={buttonClass} data-testid="consent-reject">
            {t("consent.reject")}
          </button>
          <button type="button" onClick={accept} className={buttonClass} data-testid="consent-accept">
            {t("consent.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
