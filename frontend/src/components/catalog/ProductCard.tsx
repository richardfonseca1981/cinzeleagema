import { Link } from "react-router-dom";
import type { Product } from "../../types";
import { formatPrice, formatWeightSize } from "../../lib/format";
import { useCart } from "../../lib/cart";
import { useToast } from "../Toast";

export function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const { showToast } = useToast();
  const image = product.images[0]?.url ?? null;

  function handleAdd() {
    addItem({ productId: product.id, name: product.name, unitPrice: Number(product.price), imageUrl: image });
    showToast("success", "Adicionado ao pedido");
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm transition hover:shadow-md">
      <Link to={`/catalogo/${product.id}`} className="block">
        {image ? (
          <img src={image} alt={product.name} className="h-48 w-full object-cover" />
        ) : (
          <div className="flex h-48 w-full items-center justify-center bg-[#F1F5F9] text-sm text-[#94A3B8]">Sem foto</div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Link to={`/catalogo/${product.id}`}>
          <h3 className="font-semibold text-[#1A1A1A] transition hover:text-[#1B3A6B]">{product.name}</h3>
        </Link>
        {product.description && (
          <p className="mt-1 line-clamp-2 flex-1 text-sm text-[#64748B]">{product.description}</p>
        )}
        <p className="mt-2 text-xs text-[#94A3B8]">{formatWeightSize(product.weightGrams, product.sizeCm)}</p>
        <p className="mt-2 text-lg font-bold text-[#1B3A6B]">{formatPrice(product.price)}</p>
        <button
          onClick={handleAdd}
          className="mt-3 rounded-lg bg-[#1B3A6B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#152D54]"
        >
          Adicionar ao pedido
        </button>
      </div>
    </div>
  );
}
