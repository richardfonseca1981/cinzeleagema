import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../../i18n";
import { PublicHeader } from "./PublicHeader";
import { ConsentBanner } from "../ConsentBanner";
import { CartProvider } from "../../lib/cart";
import { ConsentProvider } from "../../lib/consent";
import { ExchangeRateProvider } from "../../lib/exchangeRate";

vi.mock("../../lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/analytics")>();
  return { ...actual, updateConsent: vi.fn() };
});

function renderPublicHeader(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ConsentProvider>
        <CartProvider>
          <ExchangeRateProvider>
            <PublicHeader />
            <ConsentBanner />
          </ExchangeRateProvider>
        </CartProvider>
      </ConsentProvider>
    </MemoryRouter>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("PublicHeader — Preferências de cookies (global, todas as páginas públicas)", () => {
  it("o link aparece independente da rota pública atual", () => {
    renderPublicHeader(["/catalogo"]);
    expect(screen.getByRole("button", { name: "Preferências de cookies" })).toBeInTheDocument();
  });

  it("clicar no link reabre o banner de consentimento mesmo depois de uma escolha já salva", async () => {
    localStorage.setItem("cinzeleagema_consent", JSON.stringify({ choice: "granted", timestamp: "2026-01-01T00:00:00.000Z" }));
    renderPublicHeader();

    // Escolha salva: o banner não aparece sozinho no load.
    expect(screen.queryByTestId("consent-accept")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preferências de cookies" }));

    expect(await screen.findByTestId("consent-accept")).toBeInTheDocument();
  });
});
