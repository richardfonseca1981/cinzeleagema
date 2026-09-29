import { useTranslation } from "react-i18next";

export function TrustBanner() {
  const { t } = useTranslation();

  return (
    <section className="bg-[#15305A] py-14 text-white">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center">
        <h2 className="text-xl font-bold sm:text-2xl">{t("trustBanner.title")}</h2>
        <p className="max-w-2xl text-[#93B4D9]">{t("trustBanner.description")}</p>
        <a
          href="/#sobre"
          className="inline-block rounded-full border border-[#93B4D9]/40 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#93B4D9]/10"
        >
          {t("trustBanner.cta")}
        </a>
      </div>
    </section>
  );
}
