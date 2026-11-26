import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Modal } from "./Modal";
import { WhatsAppIcon, MailIcon } from "./icons";
import { trackEvent } from "../../lib/analytics";

// Só os dois canais REAIS de contato (WhatsApp e e-mail) — não há backend
// para receber mensagem nenhuma. Chegou a existir um formulário (nome/e-mail/
// assunto/mensagem) aqui, mas o "envio" só mostrava uma tela de sucesso sem
// mandar a mensagem a lugar nenhum, enganando o visitante — removido de
// propósito (ver CONTEXT.md "Feed de produtos" > correção do item "Contato"
// do menu, e a correção desta rodada). Se um dia houver backend de e-mail/
// notificação, um formulário de verdade pode voltar — não antes disso.
export function ContactModal({
  open,
  onClose,
  whatsappHref,
  contactEmail,
}: {
  open: boolean;
  onClose: () => void;
  whatsappHref: string | null;
  contactEmail: string | undefined;
}) {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <Modal open={open} onClose={onClose} title={t("contactModal.title")}>
      <p className="text-sm text-[#1A1A1A]">{t("contactModal.intro")}</p>
      <div className="mt-4 space-y-3">
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("whatsapp_click", { origin: "contact_modal", page: location.pathname })}
            className="flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 font-semibold text-white transition hover:opacity-90"
          >
            <WhatsAppIcon className="h-4 w-4" />
            {t("contactModal.whatsappCta")}
          </a>
        )}
        {contactEmail && (
          <a
            href={`mailto:${contactEmail}`}
            onClick={() => trackEvent("email_click", { origin: "contact_modal", page: location.pathname })}
            className="flex items-center justify-center gap-2 rounded-full border border-[#E2E8F0] px-6 py-3 font-semibold text-[#1A1A1A] transition hover:border-[#C78F50]"
          >
            <MailIcon className="h-4 w-4" />
            {contactEmail}
          </a>
        )}
      </div>
    </Modal>
  );
}
