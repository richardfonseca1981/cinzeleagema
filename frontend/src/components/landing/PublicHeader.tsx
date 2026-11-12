import { useState } from "react";
import { Header } from "./Header";
import { ContactModal } from "./ContactModal";
import { WhatsAppGroupMarquee } from "./WhatsAppGroupMarquee";
import { WHATSAPP_HREF } from "../../lib/whatsapp";

// Cabeçalho único do site público (landing, catálogo, detalhe do produto,
// carrinho, checkout) — reaproveita o Header/ContactModal da landing em vez
// de duplicar o cabeçalho em cada página. A tarja do grupo de WhatsApp mora
// aqui (não dentro do Header) para aparecer em toda página pública sem
// precisar editar cada uma; o `sticky` do conjunto fica neste wrapper (não
// no <header> — ver Header.tsx) para a tarja e o cabeçalho colarem juntos no
// topo, empilhados, sem nenhum dos dois cobrir o outro.
export function PublicHeader() {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-50">
        <WhatsAppGroupMarquee />
        <Header onOpenContact={() => setContactOpen(true)} />
      </div>
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} whatsappHref={WHATSAPP_HREF} />
    </>
  );
}
