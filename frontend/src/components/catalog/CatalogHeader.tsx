import { Link } from "react-router-dom";

export function CatalogHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold text-[#1B3A6B]">
          Cinzel e a Gema
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium text-[#1A1A1A]">
          <Link to="/catalogo" className="transition hover:text-[#1B3A6B]">
            Catálogo
          </Link>
          <Link to="/carrinho" className="transition hover:text-[#1B3A6B]">
            Meu pedido
          </Link>
        </nav>
      </div>
    </header>
  );
}
