import { useTranslation } from "react-i18next";
import { WhatsAppIcon } from "./icons";
import { WHATSAPP_GROUP_URL } from "../../lib/whatsappGroup";

// Link para o grupo de WhatsApp de ofertas exclusivas — usado no rodapé e no
// convite discreto da tela de "Pedido enviado". `className` varia o visual
// por lugar; href/rel/aria-label/texto são sempre os mesmos (fonte única).
export function WhatsAppGroupLink({ className }: { className: string }) {
  const { t } = useTranslation();
  const label = t("whatsappGroup.cta");

  return (
    <a href={WHATSAPP_GROUP_URL} target="_blank" rel="noopener noreferrer" aria-label={label} className={className}>
      <WhatsAppIcon className="h-4 w-4 flex-shrink-0" />
      {label}
    </a>
  );
}
