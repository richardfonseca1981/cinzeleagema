import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Header } from "./Header";
import { ContactModal } from "./ContactModal";
import { WhatsAppGroupMarquee } from "./WhatsAppGroupMarquee";
import { WHATSAPP_HREF } from "../../lib/whatsapp";
import { useConsent } from "../../lib/consent";

// Cabeçalho único do site público (landing, catálogo, detalhe do produto,
// carrinho, checkout, política de privacidade) — reaproveita o
// Header/ContactModal da landing em vez de duplicar o cabeçalho em cada
// página. A tarja do grupo de WhatsApp mora aqui (não dentro do Header) para
// aparecer em toda página pública sem precisar editar cada uma; o `sticky`
// do conjunto fica neste wrapper (não no <header> — ver Header.tsx) para a
// tarja e o cabeçalho colarem juntos no topo, empilhados, sem nenhum dos
// dois cobrir o outro.
//
// "Preferências de cookies" (canto inferior esquerdo, fixo) mora AQUI — não
// só no rodapé (Footer.tsx, que só existe na Home) — porque PublicHeader é o
// único componente presente em TODAS as páginas públicas, inclusive
// /privacidade. Fica no lado oposto do botão flutuante de WhatsApp
// (bottom-right) pra nunca sobrepor.
export function PublicHeader() {
  const { t } = useTranslation();
  const [contactOpen, setContactOpen] = useState(false);
  const { reopen } = useConsent();

  return (
    <>
      <div className="sticky top-0 z-50">
        <WhatsAppGroupMarquee />
        <Header onOpenContact={() => setContactOpen(true)} />
      </div>
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} whatsappHref={WHATSAPP_HREF} />
      <button
        type="button"
        onClick={reopen}
        className="fixed bottom-6 left-6 z-40 text-xs font-medium text-[#64748B] underline underline-offset-2 transition hover:text-[#1A1A1A]"
      >
        {t("footer.cookiePreferences")}
      </button>
    </>
  );
}
