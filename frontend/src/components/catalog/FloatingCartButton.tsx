import { Link } from "react-router-dom";
import { useCart } from "../../lib/cart";

export function FloatingCartButton() {
  const { totalCount } = useCart();

  return (
    <Link
      to="/carrinho"
      aria-label="Ver meu pedido"
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#1B3A6B] text-white shadow-lg transition hover:scale-105"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.94-4.708 2.436-7.184a1.125 1.125 0 00-1.1-1.35H5.625m1.875 8.534L5.106 5.272M6.75 18a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm10.5 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"
        />
      </svg>
      {totalCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#DC2626] px-1 text-xs font-bold text-white">
          {totalCount}
        </span>
      )}
    </Link>
  );
}
