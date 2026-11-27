import { useTranslation } from "react-i18next";
import { PublicHeader } from "../components/landing/PublicHeader";
import { WhatsAppFloatingButton } from "../components/landing/WhatsAppFloatingButton";
import { WHATSAPP_HREF } from "../lib/whatsapp";
import { Seo } from "../components/Seo";
import { COMPANY } from "../config/company";
import { LEGAL_POLICY } from "../config/legalPolicy";
import { formatUpdatedAt } from "../lib/format";

// Mesma leitura direta de env var que Privacy.tsx/Landing.tsx/PublicHeader.tsx
// já fazem — duplicada de propósito, mesma convenção do resto do projeto.
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL;
// Número cru, sem formatação — mesmo valor que Footer.tsx já exibe como texto
// (nenhuma página do site formata esse número, ver lib/whatsapp.ts).
const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER;

// Data fixa do último texto publicado — atualizar manualmente sempre que o
// conteúdo desta página mudar de fato (não é a data do build).
const UPDATED_AT = "2026-11-26";

export function ExchangePolicy() {
  const { t, i18n } = useTranslation();
  const serviceHours = LEGAL_POLICY.serviceHours[i18n.language === "en" ? "en" : "pt-BR"];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <Seo title={t("exchangePolicy.metaTitle")} description={t("exchangePolicy.pageTitle")} path="/troca-e-devolucao" />
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">{t("exchangePolicy.pageTitle")}</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          {t("exchangePolicy.updatedAt", { date: formatUpdatedAt(UPDATED_AT, i18n.language) })}
        </p>
        {i18n.language === "en" && (
          <p className="mt-2 text-sm italic text-[#64748B]">{t("exchangePolicy.divergenceNotice")}</p>
        )}

        <p className="mt-6 leading-relaxed text-[#1A1A1A]">
          {t("exchangePolicy.companyLine", { legalName: COMPANY.legalName, cnpj: COMPANY.cnpj, address: COMPANY.address })}
        </p>
        <p className="mt-2 leading-relaxed text-[#1A1A1A]">
          {t("exchangePolicy.serviceInfo", { email: CONTACT_EMAIL, whatsapp: WHATSAPP_NUMBER, serviceHours })}
        </p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("exchangePolicy.withdrawalTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">
            {t("exchangePolicy.withdrawalIntro", { withdrawalDays: LEGAL_POLICY.withdrawalDays })}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed text-[#1A1A1A]">
            <li>
              {t("exchangePolicy.withdrawalListRequest", {
                email: CONTACT_EMAIL,
                responseBusinessDays: LEGAL_POLICY.responseBusinessDays,
              })}
            </li>
            <li>{t("exchangePolicy.withdrawalListCondition")}</li>
            <li>{t("exchangePolicy.withdrawalListShippingCost")}</li>
            <li>
              {t("exchangePolicy.withdrawalListRefund", { refundBusinessDays: LEGAL_POLICY.refundBusinessDays })}
            </li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("exchangePolicy.defectTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">
            {t("exchangePolicy.defectIntro", { defectNoticeDays: LEGAL_POLICY.defectNoticeDays })}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed text-[#1A1A1A]">
            <li>
              {t("exchangePolicy.defectListAnalysis", {
                defectAnalysisBusinessDays: LEGAL_POLICY.defectAnalysisBusinessDays,
              })}
            </li>
            <li>{t("exchangePolicy.defectListShippingCost")}</li>
            <li>{t("exchangePolicy.defectListDamagedTransport")}</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("exchangePolicy.naturalVariationTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("exchangePolicy.naturalVariationBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("exchangePolicy.voluntaryExchangeTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">
            {t("exchangePolicy.voluntaryExchangeBody", { voluntaryExchangeDays: LEGAL_POLICY.voluntaryExchangeDays })}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("exchangePolicy.customOrdersTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("exchangePolicy.customOrdersBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("exchangePolicy.howToRequestTitle")}</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed text-[#1A1A1A]">
            <li>{t("exchangePolicy.howToRequestStep1", { email: CONTACT_EMAIL })}</li>
            <li>{t("exchangePolicy.howToRequestStep2")}</li>
            <li>{t("exchangePolicy.howToRequestStep3")}</li>
            <li>{t("exchangePolicy.howToRequestStep4")}</li>
          </ol>
        </section>
      </div>
      <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
    </div>
  );
}
