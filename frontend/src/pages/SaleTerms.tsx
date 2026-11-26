import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
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

export function SaleTerms() {
  const { t, i18n } = useTranslation();
  const serviceHours = LEGAL_POLICY.serviceHours[i18n.language === "en" ? "en" : "pt-BR"];
  const installments = LEGAL_POLICY.installments[i18n.language === "en" ? "en" : "pt-BR"];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <Seo title={t("saleTerms.metaTitle")} description={t("saleTerms.pageTitle")} path="/termos-de-venda" />
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">{t("saleTerms.pageTitle")}</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          {t("saleTerms.updatedAt", { date: formatUpdatedAt(UPDATED_AT, i18n.language) })}
        </p>
        {i18n.language === "en" && <p className="mt-2 text-sm italic text-[#64748B]">{t("saleTerms.divergenceNotice")}</p>}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("saleTerms.whoWeAreTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">
            {t("saleTerms.whoWeAreBody", {
              legalName: COMPANY.legalName,
              cnpj: COMPANY.cnpj,
              address: COMPANY.address,
              email: CONTACT_EMAIL,
              whatsapp: WHATSAPP_NUMBER,
              serviceHours,
            })}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("saleTerms.productsTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("saleTerms.productsBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("saleTerms.pricingTitle")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed text-[#1A1A1A]">
            <li>{t("saleTerms.pricingListPrices")}</li>
            <li>{t("saleTerms.pricingListAvailability", { refundBusinessDays: LEGAL_POLICY.refundBusinessDays })}</li>
            <li>{t("saleTerms.pricingListPayment", { installments })}</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("saleTerms.shippingTitle")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed text-[#1A1A1A]">
            <li>{t("saleTerms.shippingListCalculation")}</li>
            <li>{t("saleTerms.shippingListPosting", { shippingBusinessDays: LEGAL_POLICY.shippingBusinessDays })}</li>
            <li>{t("saleTerms.shippingListPackaging")}</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("saleTerms.exchangeTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">
            {t("saleTerms.exchangeBeforeLink")}
            <Link to="/troca-e-devolucao" className="font-medium text-[#C78F50] underline underline-offset-2">
              {t("saleTerms.exchangeLinkText")}
            </Link>
            {t("saleTerms.exchangeAfterLink")}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("saleTerms.privacyTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">
            {t("saleTerms.privacyBeforeLink")}
            <Link to="/privacidade" className="font-medium text-[#C78F50] underline underline-offset-2">
              {t("saleTerms.privacyLinkText")}
            </Link>
            {t("saleTerms.privacyAfterLink")}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("saleTerms.changesTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("saleTerms.changesBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("saleTerms.jurisdictionTitle")}</h2>
          <p className="mt-2 leading-relaxed text-[#1A1A1A]">{t("saleTerms.jurisdictionBody")}</p>
        </section>
      </div>
      <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
    </div>
  );
}
