import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../lib/cart";
import { formatPrice } from "../lib/format";
import { CatalogHeader } from "../components/catalog/CatalogHeader";

export function Cart() {
  const { items, removeItem, updateQuantity, totalEstimate } = useCart();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <CatalogHeader />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">Seu pedido</h1>

        {items.length === 0 ? (
          <div className="mt-6 rounded-lg border border-[#E2E8F0] bg-white p-8 text-center">
            <p className="text-[#64748B]">Seu pedido está vazio.</p>
            <Link
              to="/catalogo"
              className="mt-4 inline-block rounded-lg bg-[#1B3A6B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#152D54]"
            >
              Ver catálogo
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 divide-y divide-[#E2E8F0] rounded-lg border border-[#E2E8F0] bg-white">
              {items.map((item) => (
                <div key={item.productId} className="flex flex-wrap items-center gap-4 p-4">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="h-16 w-16 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[#F1F5F9] text-xs text-[#94A3B8]">
                      Sem foto
                    </div>
                  )}
                  <div className="min-w-[140px] flex-1">
                    <p className="font-medium text-[#1A1A1A]">{item.name}</p>
                    <p className="text-sm text-[#64748B]">{formatPrice(item.unitPrice)} / unidade</p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item.productId, Math.max(1, Number(e.target.value)))}
                    className="w-16 rounded-lg border border-[#E2E8F0] px-2 py-1 text-center text-sm outline-none transition focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]"
                  />
                  <p className="w-24 text-right font-semibold text-[#1A1A1A]">
                    {formatPrice(item.unitPrice * item.quantity)}
                  </p>
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="text-sm text-[#64748B] transition hover:text-[#DC2626]"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-white p-4">
              <span className="font-medium">Total estimado</span>
              <span className="text-xl font-bold text-[#1B3A6B]">{formatPrice(totalEstimate)}</span>
            </div>

            <button
              onClick={() => navigate("/finalizar")}
              className="mt-6 w-full rounded-lg bg-[#1B3A6B] px-4 py-3 font-semibold text-white transition hover:bg-[#152D54]"
            >
              Finalizar pedido
            </button>
          </>
        )}
      </div>
    </div>
  );
}
