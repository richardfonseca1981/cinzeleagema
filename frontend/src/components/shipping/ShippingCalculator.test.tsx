import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n";
import { ShippingCalculator } from "./ShippingCalculator";
import { useShippingController } from "../../lib/shipping/useShippingController";
import type { CartItem } from "../../types";
import type { ShippingQuoteResult } from "../../lib/shipping/types";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getShippingQuote: vi.fn(),
      lookupPostalCode: vi.fn().mockResolvedValue({ postalCode: "01310100", city: null, state: null }),
    },
  };
});

vi.mock("../../lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/analytics")>();
  return { ...actual, trackEvent: vi.fn() };
});

import { api } from "../../lib/api";
import { trackEvent } from "../../lib/analytics";

const ITEMS: CartItem[] = [
  {
    productId: "p1",
    name: "Ametista",
    nameEn: null,
    sku: "SKU-1",
    unitPrice: 100,
    imageUrl: null,
    weightGrams: 500,
    sizeCm: 10,
    quantity: 1,
  },
];

const QUOTE_RESULT: ShippingQuoteResult = {
  destination: { country: "BR", postalCode: "01310100", city: "São Paulo", state: "SP" },
  mode: "domestic",
  options: [
    { id: "opt-cheap", carrier: "Correios", service: "PAC", priceBRL: 25, deliveryDaysMin: 5, deliveryDaysMax: 8, kind: "quoted" },
    { id: "opt-fast", carrier: "Correios", service: "SEDEX", priceBRL: 40, deliveryDaysMin: 2, deliveryDaysMax: 3, kind: "quoted" },
  ],
  requiresConfirmation: false,
  notice: null,
  unavailable: null,
};

function Harness() {
  const controller = useShippingController(ITEMS);
  return <ShippingCalculator controller={controller} items={ITEMS} exchangeRate={null} onCloseArranged={() => {}} />;
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.getShippingQuote).mockResolvedValue(QUOTE_RESULT);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ShippingCalculator — evento shipping_quote (GA4)", () => {
  it("dispara shipping_quote com país, cidade/estado e o preço mais barato — nunca o CEP", async () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("CEP"), { target: { value: "01310-100" } });
    fireEvent.click(screen.getByRole("button", { name: "Calcular frete" }));

    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith("shipping_quote", expect.anything()));

    const [, params] = vi.mocked(trackEvent).mock.calls[0];
    expect(params).toMatchObject({ country: "BR", cheapest_price_brl: 25 });
    expect(JSON.stringify(params)).not.toContain("01310100");
    expect(JSON.stringify(params)).not.toContain("01310-100");
  });

  it("restaurar uma cotação já salva (sem clicar em Calcular) NÃO dispara shipping_quote", async () => {
    render(<Harness />);
    await screen.findByRole("button", { name: "Calcular frete" });
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
