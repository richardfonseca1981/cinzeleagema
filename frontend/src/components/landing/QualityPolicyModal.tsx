import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

export function QualityPolicyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={t("qualityPolicyModal.title")}>
      <div className="space-y-4 text-sm leading-relaxed text-[#64748B]">
        <p>{t("qualityPolicyModal.paragraph1")}</p>
        <p>{t("qualityPolicyModal.paragraph2")}</p>
        <p>{t("qualityPolicyModal.paragraph3")}</p>
      </div>
    </Modal>
  );
}
