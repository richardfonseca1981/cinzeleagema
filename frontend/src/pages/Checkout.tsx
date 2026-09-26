import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../lib/cart";
import { api } from "../lib/api";
import { formatPrice } from "../lib/format";
import { CatalogHeader } from "../components/catalog/CatalogHeader";

const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER;

function buildWhatsAppMessage(
  items: { name: string; quantity: number; unitPrice: number }[],
  totalEstimate: number,
  customerName: string,
  customerPhone: string
) {
  const lines = [
    "Olá! Gostaria de fazer um pedido:",
    ...items.map((item) => `• ${item.quantity}x ${item.name} — ${formatPrice(item.unitPrice * item.quantity)}`),
    `Total estimado: ${formatPrice(totalEstimate)}`,
    `Nome: ${customerName}`,
    `Telefone: ${customerPhone}`,
  ];
  return lines.join("\n");
}

export function Checkout() {
  const { items, totalEstimate, clear } = useCart();
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [sentVia, setSentVia] = useState<"fluxiodesk" | "whatsapp" | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (items.length === 0) return;
    setSending(true);

    const orderItems = items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));

    let delivered = false;
    try {
      const result = await api.createOrder({ customerName, customerPhone, items: orderItems, totalEstimate });
      delivered = result.delivered;
    } catch {
      delivered = false;
    }

    if (delivered) {
      clear();
      setSentVia("fluxiodesk");
    } else {
      if (WHATSAPP_NUMBER) {
        const message = buildWhatsAppMessage(orderItems, totalEstimate, customerName, customerPhone);
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      }
      clear();
      setSentVia("whatsapp");
    }

    setSending(false);
  }

  if (items.length === 0 && !sentVia) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
        <CatalogHeader />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-[#64748B]">Seu pedido está vazio.</p>
        </div>
      </div>
    );
  }

  if (sentVia) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
        <CatalogHeader />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-[#1B3A6B]">Pedido enviado!</h1>
          <p className="mt-3 text-[#64748B]">
            {sentVia === "fluxiodesk"
              ? "Recebemos seu pedido e nossa equipe vai entrar em contato em breve."
              : "Abrimos o WhatsApp com os detalhes do seu pedido — é só enviar a mensagem para confirmarmos com você."}
          </p>
          <button
            onClick={() => navigate("/catalogo")}
            className="mt-6 rounded-lg bg-[#1B3A6B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#152D54]"
          >
            Voltar ao catálogo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1A1A1A]">
      <CatalogHeader />
      <div className="mx-auto max-w-lg px-4 py-8">
        <h1 className="text-2xl font-bold">Finalizar pedido</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          Sem pagamento pelo site — nossa equipe entra em contato para combinar entrega e forma de pagamento.
        </p>

        <div className="mt-6 rounded-lg border border-[#E2E8F0] bg-white p-4">
          <p className="text-sm font-medium text-[#1A1A1A]">Resumo</p>
          <ul className="mt-2 space-y-1 text-sm text-[#64748B]">
            {items.map((item) => (
              <li key={item.productId}>
                {item.quantity}x {item.name}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-[#E2E8F0] pt-3 font-semibold">
            <span>Total estimado</span>
            <span className="text-[#1B3A6B]">{formatPrice(totalEstimate)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-[#E2E8F0] bg-white p-4">
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A]">Nome</label>
            <input
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 outline-none transition focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A]">Telefone/WhatsApp</label>
            <input
              required
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="(14) 99999-0000"
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 outline-none transition focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]"
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-lg bg-[#1B3A6B] px-4 py-3 font-semibold text-white transition hover:bg-[#152D54] disabled:opacity-50"
          >
            {sending ? "Enviando..." : "Confirmar pedido"}
          </button>
        </form>
      </div>
    </div>
  );
}
