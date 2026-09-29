import { useTranslation } from "react-i18next";

export function About() {
  const { t } = useTranslation();

  return (
    <section id="sobre" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-2xl px-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-[#C78F50]">{t("about.eyebrow")}</p>
        <h2 className="mt-2 text-2xl font-bold text-[#1A1A1A] sm:text-3xl">{t("about.title")}</h2>
        <p className="mt-5 leading-relaxed text-[#64748B]">{t("about.paragraph1")}</p>
        <p className="mt-4 leading-relaxed text-[#64748B]">{t("about.paragraph2")}</p>
      </div>
    </section>
  );
}
