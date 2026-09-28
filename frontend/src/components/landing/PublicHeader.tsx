import { useState } from "react";
import { Header } from "./Header";
import { ContactModal } from "./ContactModal";
import { WHATSAPP_HREF } from "../../lib/whatsapp";

// Cabeçalho único do site público (landing, catálogo, detalhe do produto,
// carrinho, checkout) — reaproveita o Header/ContactModal da landing em vez
// de duplicar o cabeçalho em cada página.
export function PublicHeader() {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      <Header whatsappHref={WHATSAPP_HREF} onOpenContact={() => setContactOpen(true)} />
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} whatsappHref={WHATSAPP_HREF} />
    </>
  );
}
