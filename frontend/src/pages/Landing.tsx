import { useEffect, useState } from "react";
import { About } from "../components/landing/About";
import { Blog } from "../components/landing/Blog";
import { Certification } from "../components/landing/Certification";
import { Faq } from "../components/landing/Faq";
import { FeaturedProducts } from "../components/landing/FeaturedProducts";
import { Footer } from "../components/landing/Footer";
import { Gallery } from "../components/landing/Gallery";
import { Hero } from "../components/landing/Hero";
import { PublicHeader } from "../components/landing/PublicHeader";
import { QualityPolicyModal } from "../components/landing/QualityPolicyModal";
import { TrustBanner } from "../components/landing/TrustBanner";
import { WhatsAppFloatingButton } from "../components/landing/WhatsAppFloatingButton";
import { WHATSAPP_HREF } from "../lib/whatsapp";

const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER;
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL;

export function Landing() {
  const [qualityOpen, setQualityOpen] = useState(false);

  // A rolagem nativa do navegador para "#id" acontece só uma vez, no
  // carregamento do documento — como o conteúdo é renderizado pelo React, a
  // seção-alvo ainda não existe nesse momento quando se chega de outra
  // página (ex.: /catalogo -> /#faq). Por isso a rolagem é feita aqui, depois
  // que a landing termina de montar.
  useEffect(() => {
    if (!window.location.hash) return;
    const id = window.location.hash.slice(1);
    document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <PublicHeader />
      <Hero />
      <FeaturedProducts />
      <TrustBanner />
      <Faq />
      <About />
      <Certification />
      <Gallery />
      <Blog />
      <Footer
        whatsappHref={WHATSAPP_HREF}
        whatsappNumber={WHATSAPP_NUMBER}
        contactEmail={CONTACT_EMAIL}
        onOpenQualityPolicy={() => setQualityOpen(true)}
      />

      <QualityPolicyModal open={qualityOpen} onClose={() => setQualityOpen(false)} />
      <WhatsAppFloatingButton whatsappHref={WHATSAPP_HREF} />
    </div>
  );
}
