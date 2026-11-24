import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../i18n";
import { Checkout } from "./Checkout";
import { CartProvider } from "../lib/cart";
import { ConsentProvider } from "../lib/consent";
import { ExchangeRateProvider } from "../lib/exchangeRate";
import { ToastProvider } from "../components/Toast";
import { cartSignature } from "../lib/shipping/cartSignature";
import type { ShippingQuoteResult } from "../lib/shipping/types";
import type { CartItem } from "../types";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      createOrder: vi.fn(),
    },
  };
});

vi.mock("../lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/analytics")>();
  return { ...actual, trackEvent: vi.fn() };
});

import { api } from "../lib/api";
import { trackEvent } from "../lib/analytics";

const CART_ITEM: CartItem = {
  productId: "p1",
  name: "Ametista",
  nameEn: null,
  sku: "SKU-1",
  unitPrice: 100,
  imageUrl: null,
  weightGrams: 500,
  sizeCm: 10,
  quantity: 1,
};

const QUOTE_RESULT: ShippingQuoteResult = {
  destination: { country: "BR", postalCode: "01310100", city: "São Paulo", state: "SP" },
  mode: "domestic",
  options: [{ id: "opt-cheap", carrier: "Correios", service: "PAC", priceBRL: 25, deliveryDaysMin: 5, deliveryDaysMax: 8, kind: "quoted" }],
  requiresConfirmation: false,
  notice: null,
  unavailable: null,
};

// Carrinho + frete JÁ cotado e fresco (ver confirmShipping/isReadyToConfirm) —
// o clique em "Confirmar pedido" vai direto pro envio, sem precisar mockar
// GET /api/shipping/quote de novo.
function seedCartAndFreshShipping() {
  localStorage.setItem("cinzeleagema_cart", JSON.stringify([CART_ITEM]));
  const signature = cartSignature([{ productId: CART_ITEM.productId, quantity: CART_ITEM.quantity }]);
  localStorage.setItem(
    "cinzeleagema_shipping",
    JSON.stringify({
      version: 2,
      country: "BR",
      postalCode: "01310100",
      city: "São Paulo",
      state: "SP",
      quote: { result: QUOTE_RESULT, signature, savedAt: Date.now() },
      selection: "opt-cheap",
      arrangeChoice: null,
    })
  );
}

function renderCheckout() {
  return render(
    <MemoryRouter initialEntries={["/finalizar"]}>
      <ConsentProvider>
        <CartProvider>
          <ExchangeRateProvider>
            <ToastProvider>
              <Checkout />
            </ToastProvider>
          </ExchangeRateProvider>
        </CartProvider>
      </ConsentProvider>
    </MemoryRouter>
  );
}

async function fillAndSubmit() {
  // Os campos "Nome"/"Telefone" não têm htmlFor/id (gap de acessibilidade
  // pré-existente, fora do escopo desta rodada) — getAllByRole na ordem do
  // DOM é o jeito estável de achar os dois inputs de texto do formulário.
  const [nameInput, phoneInput] = screen.getAllByRole("textbox");
  fireEvent.change(nameInput, { target: { value: "Maria" } });
  fireEvent.change(phoneInput, { target: { value: "11999990000" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar pedido" }));
  await screen.findByText(/Pedido enviado!/);
}

beforeEach(() => {
  localStorage.clear();
  seedCartAndFreshShipping();
  vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Checkout — eventos (GA4)", () => {
  it("dispara begin_checkout com value/currency/num_items ao confirmar", async () => {
    vi.mocked(api.createOrder).mockResolvedValue({ delivered: true });
    renderCheckout();

    await fillAndSubmit();

    expect(trackEvent).toHaveBeenCalledWith("begin_checkout", { value: 100, currency: "BRL", num_items: 1 });
  });

  it("pedido entregue via Fluxiodesk: generate_lead com method 'fluxiodesk'", async () => {
    vi.mocked(api.createOrder).mockResolvedValue({ delivered: true });
    renderCheckout();

    await fillAndSubmit();

    expect(trackEvent).toHaveBeenCalledWith("generate_lead", { method: "fluxiodesk", value: 100, currency: "BRL" });
    expect(trackEvent).not.toHaveBeenCalledWith("whatsapp_click", expect.anything());
  });

  it("Fluxiodesk indisponível: cai no fallback do WhatsApp — generate_lead com method 'whatsapp', SEM whatsapp_click (evita duplicar)", async () => {
    vi.mocked(api.createOrder).mockRejectedValue(new Error("fluxiodesk fora do ar"));
    renderCheckout();

    await fillAndSubmit();

    expect(trackEvent).toHaveBeenCalledWith("generate_lead", { method: "whatsapp", value: 100, currency: "BRL" });
    expect(trackEvent).not.toHaveBeenCalledWith("whatsapp_click", expect.anything());
  });
});
