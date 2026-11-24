import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Privacy } from "./Privacy";
import { CartProvider } from "../lib/cart";
import { ExchangeRateProvider } from "../lib/exchangeRate";
import { ToastProvider } from "../components/Toast";

function renderPrivacy() {
  return render(
    <MemoryRouter initialEntries={["/privacidade"]}>
      <CartProvider>
        <ExchangeRateProvider>
          <ToastProvider>
            <Privacy />
          </ToastProvider>
        </ExchangeRateProvider>
      </CartProvider>
    </MemoryRouter>
  );
}

afterEach(() => cleanup());

describe("Privacy", () => {
  it("define title/description próprios e mostra as seções da política", async () => {
    renderPrivacy();

    await screen.findByRole("heading", { level: 1, name: "Política de Privacidade" });
    expect(document.title).toBe("Política de Privacidade — Cinzel e a Gema");

    expect(screen.getByText("Quem é o controlador dos dados")).toBeInTheDocument();
    expect(screen.getByText("O que coletamos")).toBeInTheDocument();
    expect(screen.getByText("Consentimento e Google Consent Mode")).toBeInTheDocument();
    expect(screen.getByText("Seus direitos (LGPD)")).toBeInTheDocument();
  });
});
