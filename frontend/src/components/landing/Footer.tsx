import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FacebookIcon, InstagramIcon, LinkedinIcon, MailIcon, WhatsAppIcon } from "./icons";
import { WhatsAppGroupLink } from "./WhatsAppGroupLink";
import { useConsent } from "../../lib/consent";
import { trackEvent } from "../../lib/analytics";
import { COMPANY } from "../../config/company";

export function Footer({
  whatsappHref,
  whatsappNumber,
  contactEmail,
  onOpenQualityPolicy,
}: {
  whatsappHref: string | null;
  whatsappNumber: string | undefined;
  contactEmail: string | undefined;
  onOpenQualityPolicy: () => void;
}) {
  const { t } = useTranslation();
  const { reopen } = useConsent();
  const location = useLocation();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#010B1A] py-12 text-[#5F84BA]">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <span className="text-lg font-bold text-white">Cinzel e a Gema</span>
            <p className="mt-3 text-sm leading-relaxed text-[#5F84BA]">{t("footer.tagline")}</p>
            <div className="mt-4 flex gap-3">
              {/* Redes sociais placeholder — sem links reais ainda */}
              <span className="rounded-full border border-[#5F84BA]/40 p-2 text-[#5F84BA]">
                <InstagramIcon className="h-4 w-4" />
              </span>
              <span className="rounded-full border border-[#5F84BA]/40 p-2 text-[#5F84BA]">
                <FacebookIcon className="h-4 w-4" />
              </span>
              <span className="rounded-full border border-[#5F84BA]/40 p-2 text-[#5F84BA]">
                <LinkedinIcon className="h-4 w-4" />
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[#5F84BA]">{t("footer.contactTitle")}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {whatsappHref && whatsappNumber && (
                <li>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("whatsapp_click", { origin: "footer", page: location.pathname })}
                    className="flex items-center gap-2 hover:text-white"
                  >
                    <WhatsAppIcon className="h-4 w-4 flex-shrink-0" />
                    {whatsappNumber}
                  </a>
                </li>
              )}
              <li>
                <WhatsAppGroupLink className="flex items-center gap-2 hover:text-white" />
              </li>
              {contactEmail && (
                <li>
                  <a
                    href={`mailto:${contactEmail}`}
                    onClick={() => trackEvent("email_click", { origin: "footer", page: location.pathname })}
                    className="flex items-center gap-2 hover:text-white"
                  >
                    <MailIcon className="h-4 w-4 flex-shrink-0" />
                    {contactEmail}
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[#5F84BA]">{t("footer.navTitle")}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="/#sobre" className="hover:text-white">{t("footer.about")}</a></li>
              <li><Link to="/catalogo" className="hover:text-white">{t("footer.products")}</Link></li>
              <li><a href="/#faq" className="hover:text-white">{t("footer.faq")}</a></li>
              <li>
                <button type="button" onClick={onOpenQualityPolicy} className="hover:text-white">
                  {t("footer.qualityPolicy")}
                </button>
              </li>
              <li><Link to="/privacidade" className="hover:text-white">{t("footer.privacyPolicy")}</Link></li>
              {/* Política de Troca/Devolução e Termos de Venda: ainda sem página própria
                  (aguardam decisão do cliente, ver CONTEXT.md). Adicionar aqui como novos
                  <li><Link to="/..."> quando as páginas existirem — não criar link morto antes disso. */}
              <li>
                <button type="button" onClick={reopen} className="hover:text-white">
                  {t("footer.cookiePreferences")}
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-[#5F84BA]/20 pt-6 text-center text-xs text-[#5F84BA] space-y-1">
          <p>
            {t("footer.companyInfo", { legalName: COMPANY.legalName, cnpj: COMPANY.cnpj, address: COMPANY.address })}
          </p>
          <p>{t("footer.copyright", { year })}</p>
        </div>
      </div>
    </footer>
  );
}
