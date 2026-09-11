const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER ?? "5500000000000";
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL ?? "contato@cinzeleagema.com.br";

const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Olá! Gostaria de saber mais sobre a Cinzel e a Gema."
)}`;

export function Home() {
  return (
    <div className="min-h-screen bg-gem-black font-sans text-gem-cream">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <span className="font-serif text-2xl tracking-wide text-gem-cream">
            Cinzel <span className="text-gem-gold">&</span> a Gema
          </span>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-full border border-gem-gold px-4 py-2 text-sm text-gem-gold transition hover:bg-gem-gold hover:text-gem-black sm:inline-block"
          >
            Fale conosco
          </a>
        </div>
      </header>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center sm:py-32">
          <h1 className="font-serif text-4xl leading-tight text-gem-cream sm:text-6xl">
            Pedras preciosas selecionadas com{" "}
            <span className="text-gem-gold">exclusividade</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-gem-cream/70 sm:text-lg">
            Curadoria, procedência e qualidade em cada peça.
          </p>
        </div>
      </section>

      <section className="border-b border-white/10 bg-gem-charcoal">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="font-serif text-3xl text-gem-gold">Sobre</h2>
          <p className="mt-6 text-base leading-relaxed text-gem-cream/80 sm:text-lg">
            A Cinzel e a Gema trabalha com a curadoria e comercialização de
            pedras preciosas, unindo qualidade e procedência em cada peça
            selecionada.
          </p>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="font-serif text-3xl text-gem-gold">Catálogo em breve</h2>
          <p className="mt-6 text-base leading-relaxed text-gem-cream/80 sm:text-lg">
            Estamos preparando nosso catálogo completo. Em breve você poderá
            conhecer todas as peças aqui mesmo.
          </p>
        </div>
      </section>

      <section id="contato" className="bg-gem-charcoal">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="font-serif text-3xl text-gem-gold">Contato</h2>
          <p className="mt-6 text-base leading-relaxed text-gem-cream/80 sm:text-lg">
            Fale com a gente pelo WhatsApp.
          </p>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-block rounded-full bg-gem-gold px-8 py-3 text-sm font-medium text-gem-black transition hover:bg-gem-gold-light"
          >
            Conversar no WhatsApp
          </a>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-10 text-center text-sm text-gem-cream/50">
          <p className="font-serif text-lg text-gem-cream/80">Cinzel e a Gema</p>
          <p className="mt-2">
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-gem-gold">
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="mt-4">
            © {new Date().getFullYear()} Cinzel e a Gema. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
