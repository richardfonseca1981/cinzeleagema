import { useTranslation } from "react-i18next";
import { ShieldCheckIcon } from "./icons";

export function Certification() {
  const { t } = useTranslation();

  return (
    <section className="bg-[#F1F5F9] py-16 sm:py-20">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-4 text-center sm:flex-row sm:text-left">
        <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[#94A3B8] text-[#94A3B8]">
          <ShieldCheckIcon className="h-10 w-10" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#94A3B8]">{t("certification.badge")}</p>
          <h2 className="mt-1 text-xl font-bold text-[#1A1A1A] sm:text-2xl">{t("certification.title")}</h2>
          <p className="mt-1 text-sm font-semibold text-[#C78F50]">{t("certification.subtitle")}</p>
          <p className="mt-3 leading-relaxed text-[#64748B]">{t("certification.description")}</p>
        </div>
      </div>
    </section>
  );
}
