import { Link } from "react-router-dom";
import { PLACEHOLDER_PRODUCTS } from "./data";
import { PlaceholderImage } from "./PlaceholderImage";

export function FeaturedProducts({ whatsappHref }: { whatsappHref: string | null }) {
  return (
    <section id="produtos" className="bg-[#F8FAFC] py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#1B3A6B]">Peças em destaque</p>
          <h2 className="mt-2 text-2xl font-bold text-[#1A1A1A] sm:text-3xl">Conheça algumas de nossas peças</h2>
          <p className="mt-4 text-[#64748B]">
            Catálogo completo em construção. As peças abaixo são exemplos ilustrativos da nossa
            curadoria.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PLACEHOLDER_PRODUCTS.map((product) => (
            <div
              key={product.name}
              className="flex flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm transition hover:shadow-md"
            >
              <PlaceholderImage label="Imagem da peça (placeholder)" className="h-44 w-full" />
              <div className="flex flex-1 flex-col p-5">
                <h3 className="font-semibold text-[#1A1A1A]">{product.name}</h3>
                <p className="mt-1 flex-1 text-sm text-[#64748B]">{product.description}</p>
                {whatsappHref ? (
                  <a
                    href={`${whatsappHref}?text=${encodeURIComponent(`Olá! Tenho interesse em saber mais sobre: ${product.name}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center justify-center rounded-lg border border-[#1B3A6B] px-4 py-2 text-sm font-semibold text-[#1B3A6B] transition hover:bg-[#EFF6FF]"
                  >
                    Saiba mais
                  </a>
                ) : (
                  <span className="mt-4 inline-flex items-center justify-center rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#94A3B8]">
                    Saiba mais
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/catalogo"
            className="inline-flex items-center justify-center rounded-full bg-[#1B3A6B] px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#152D54]"
          >
            Visualizar todos os produtos
          </Link>
        </div>
      </div>
    </section>
  );
}
