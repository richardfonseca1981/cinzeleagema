import { HERO_CONTENT } from "./data";
import { PlaceholderImage } from "./PlaceholderImage";

export function Hero({ whatsappHref }: { whatsappHref: string | null }) {
  return (
    <section id="home" className="grid lg:min-h-[600px] lg:grid-cols-2">
      <div className="order-1 flex flex-col justify-center bg-[#1B3A6B] px-6 py-16 text-white sm:px-10 lg:order-1 lg:py-20">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-[#93B4D9]">
          Curadoria de pedras preciosas
        </p>
        <h1 className="text-4xl font-black uppercase leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
          {HERO_CONTENT.title}
        </h1>
        <p className="mt-6 max-w-md text-white/80 sm:text-lg">{HERO_CONTENT.subtitle}</p>
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex w-fit items-center justify-center rounded-full bg-white px-8 py-3.5 font-semibold text-[#1B3A6B] shadow-lg transition hover:bg-[#EFF6FF]"
          >
            Onde comprar
          </a>
        )}
      </div>

      <div className="order-2 lg:order-2">
        <PlaceholderImage
          label="Peça em destaque da Cinzel e a Gema (placeholder)"
          className="h-64 w-full sm:h-80 lg:h-full"
        />
      </div>
    </section>
  );
}
