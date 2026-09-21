import { FacebookIcon, InstagramIcon, LinkedinIcon, MailIcon, MapPinIcon, WhatsAppIcon } from "./icons";

export function Footer({
  whatsappHref,
  whatsappNumber,
  contactEmail,
  onOpenQualityPolicy,
}: {
  whatsappHref: string | null;
  whatsappNumber: string | undefined;
  contactEmail: string | undefined;
  onOpenQualityPolicy: () => void;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#1B3A6B] py-12 text-[#93B4D9]">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <span className="text-lg font-bold text-white">Cinzel e a Gema</span>
            <p className="mt-3 text-sm leading-relaxed text-[#93B4D9]">
              Curadoria e comercialização de pedras preciosas com foco em qualidade e procedência.
            </p>
            <div className="mt-4 flex gap-3">
              {/* Redes sociais placeholder — sem links reais ainda */}
              <span className="rounded-full border border-[#93B4D9]/40 p-2 text-[#93B4D9]">
                <InstagramIcon className="h-4 w-4" />
              </span>
              <span className="rounded-full border border-[#93B4D9]/40 p-2 text-[#93B4D9]">
                <FacebookIcon className="h-4 w-4" />
              </span>
              <span className="rounded-full border border-[#93B4D9]/40 p-2 text-[#93B4D9]">
                <LinkedinIcon className="h-4 w-4" />
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[#93B4D9]">Contato</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {whatsappHref && whatsappNumber && (
                <li>
                  <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white">
                    <WhatsAppIcon className="h-4 w-4 flex-shrink-0" />
                    {whatsappNumber}
                  </a>
                </li>
              )}
              {contactEmail && (
                <li>
                  <a href={`mailto:${contactEmail}`} className="flex items-center gap-2 hover:text-white">
                    <MailIcon className="h-4 w-4 flex-shrink-0" />
                    {contactEmail}
                  </a>
                </li>
              )}
              <li className="flex items-center gap-2 text-[#93B4D9]">
                <MapPinIcon className="h-4 w-4 flex-shrink-0" />
                Endereço a definir
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[#93B4D9]">Navegação</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="#sobre" className="hover:text-white">Sobre Nós</a></li>
              <li><a href="#produtos" className="hover:text-white">Produtos</a></li>
              <li><a href="#faq" className="hover:text-white">FAQ</a></li>
              <li>
                <button type="button" onClick={onOpenQualityPolicy} className="hover:text-white">
                  Política de Qualidade
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-[#93B4D9]/20 pt-6 text-center text-xs text-[#93B4D9]">
          © {year} Cinzel e a Gema. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
