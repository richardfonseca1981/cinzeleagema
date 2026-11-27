import { useTranslation } from "react-i18next";
import { PublicHeader } from "../components/landing/PublicHeader";
import { WhatsAppFloatingButton } from "../components/landing/WhatsAppFloatingButton";
import { WHATSAPP_HREF } from "../lib/whatsapp";
import { Seo } from "../components/Seo";
import { COMPANY } from "../config/company";
import { formatUpdatedAt } from "../lib/format";

// Mesma leitura direta de env var que Landing.tsx/PublicHeader.tsx já fazem
// (CONTACT_EMAIL) — duplicada de propósito, mesma convenção do resto do
// projeto. Não entra em config/company.ts porque esse módulo é só identidade
// jurídica (razão social/CNPJ/endereço); e-mail de contato já tinha fonte
// própria (VITE_CONTACT_EMAIL) usada em todo o site.
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL;

// Data fixa do último texto publicado — atualizar manualmente sempre que o
// conteúdo desta página mudar de fato (não é a data do build).
const UPDATED_AT = "2026-11-26";

export function Privacy() {
  const { t, i18n } = useTranslation();

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <Seo title={t("privacy.metaTitle")} description={t("privacy.intro")} path="/privacidade" />
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">{t("privacy.pageTitle")}</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          {t("privacy.updatedAt", { date: formatUpdatedAt(UPDATED_AT, i18n.language) })}
        </p>
        <p className="mt-6 leading-relaxed text-[#1A1A1A]">{t("privacy.intro")}</p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.controllerTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">
            {t("privacy.controllerBody", {
              legalName: COMPANY.legalName,
              cnpj: COMPANY.cnpj,
              address: COMPANY.address,
              email: CONTACT_EMAIL,
            })}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.whatWeCollectTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.whatWeCollectBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.orderDataTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.orderDataBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.shippingCalcTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.shippingCalcBody")}</p>
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
          <h2 className="text-lg font-semibold">{t("privacy.sharingTitle")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed text-[#1A1A1A]">
            <li>{t("privacy.sharingListGoogle")}</li>
            <li>{t("privacy.sharingListHosting")}</li>
            <li>{t("privacy.sharingListPhotos")}</li>
            <li>{t("privacy.sharingListShipping")}</li>
            <li>{t("privacy.sharingListSupport")}</li>
            <li>{t("privacy.sharingListWhatsapp")}</li>
          </ul>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.sharingClosing")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.internationalTransferTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.internationalTransferBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.retentionTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.retentionBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.rightsTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.rightsBody", { email: CONTACT_EMAIL })}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("privacy.contactTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("privacy.contactBody", { email: CONTACT_EMAIL })}</p>
        </section>
      </div>
      <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
    </div>
  );
}
