import { useTranslation } from "react-i18next";
import { PublicHeader } from "../components/landing/PublicHeader";
import { WhatsAppFloatingButton } from "../components/landing/WhatsAppFloatingButton";
import { WHATSAPP_HREF } from "../lib/whatsapp";
import { Seo } from "../components/Seo";

// Data fixa do último texto publicado — atualizar manualmente sempre que o
// conteúdo desta página mudar de fato (não é a data do build).
const UPDATED_AT = "2026-11-24";

// ATENÇÃO: os textos abaixo (locales/pt-BR.json e en.json, chaves "privacy.*")
// têm marcadores [RAZÃO SOCIAL] / [CNPJ] / [E-MAIL DE CONTATO PARA PRIVACIDADE]
// que precisam ser substituídos por dados reais do controlador ANTES do
// merge pra main — ver CONTEXT.md "SEO — Rodada 3" (pendência bloqueante).
export function Privacy() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <Seo title={t("privacy.metaTitle")} description={t("privacy.intro")} path="/privacidade" />
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">{t("privacy.pageTitle")}</h1>
        <p className="mt-1 text-sm text-[#64748B]">{t("privacy.updatedAt", { date: UPDATED_AT })}</p>
        <p className="mt-6 leading-relaxed text-[#1A1A1A]">{t("privacy.intro")}</p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.controllerTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.controllerBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.whatWeCollectTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.whatWeCollectBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.consentTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.consentBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.revokeTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.revokeBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.cookiesTitle")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed text-[#1A1A1A]">
            <li>{t("privacy.cookiesListConsent")}</li>
            <li>{t("privacy.cookiesListLocale")}</li>
            <li>{t("privacy.cookiesListCart")}</li>
            <li>{t("privacy.cookiesListUtm")}</li>
            <li>{t("privacy.cookiesListGa")}</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.rightsTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.rightsBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.contactTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.contactBody")}</p>
        </section>
      </div>
      <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
    </div>
  );
}
