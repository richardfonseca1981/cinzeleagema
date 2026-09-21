import { useState } from "react";
import { About } from "../components/landing/About";
import { Blog } from "../components/landing/Blog";
import { Certification } from "../components/landing/Certification";
import { ContactModal } from "../components/landing/ContactModal";
import { Faq } from "../components/landing/Faq";
import { FeaturedProducts } from "../components/landing/FeaturedProducts";
import { Footer } from "../components/landing/Footer";
import { Gallery } from "../components/landing/Gallery";
import { Header } from "../components/landing/Header";
import { Hero } from "../components/landing/Hero";
import { QualityPolicyModal } from "../components/landing/QualityPolicyModal";
import { TrustBanner } from "../components/landing/TrustBanner";
import { WhatsAppFloatingButton } from "../components/landing/WhatsAppFloatingButton";

const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER;
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL;

export function Landing() {
  const whatsappHref = WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}` : null;

  const [contactOpen, setContactOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <Header whatsappHref={whatsappHref} onOpenContact={() => setContactOpen(true)} />
      <Hero whatsappHref={whatsappHref} />
      <FeaturedProducts whatsappHref={whatsappHref} />
      <TrustBanner />
      <Faq />
      <About />
      <Certification />
      <Gallery />
      <Blog />
      <Footer
        whatsappHref={whatsappHref}
        whatsappNumber={WHATSAPP_NUMBER}
        contactEmail={CONTACT_EMAIL}
        onOpenQualityPolicy={() => setQualityOpen(true)}
      />

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} whatsappHref={whatsappHref} />
      <QualityPolicyModal open={qualityOpen} onClose={() => setQualityOpen(false)} />
      <WhatsAppFloatingButton whatsappHref={whatsappHref} />
    </div>
  );
}
