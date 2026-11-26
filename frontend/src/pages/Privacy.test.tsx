import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../i18n";
import { Privacy } from "./Privacy";
import { CartProvider } from "../lib/cart";
import { ConsentProvider } from "../lib/consent";
import { ExchangeRateProvider } from "../lib/exchangeRate";
import { ToastProvider } from "../components/Toast";
import { COMPANY } from "../config/company";

function renderPrivacy() {
  return render(
    <MemoryRouter initialEntries={["/privacidade"]}>
      <ConsentProvider>
        <CartProvider>
          <ExchangeRateProvider>
            <ToastProvider>
              <Privacy />
            </ToastProvider>
          </ExchangeRateProvider>
        </CartProvider>
      </ConsentProvider>
    </MemoryRouter>
  );
}

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("pt-BR");
});

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

  it("mostra o link 'Preferências de cookies' (reabre o banner), também nesta página", async () => {
    renderPrivacy();
    await screen.findByRole("heading", { level: 1, name: "Política de Privacidade" });
    expect(screen.getByRole("button", { name: "Preferências de cookies" })).toBeInTheDocument();
  });

  it("mostra razão social, CNPJ e endereço reais de company.ts (pt-BR)", async () => {
    renderPrivacy();
    await screen.findByRole("heading", { level: 1, name: "Política de Privacidade" });
    expect(screen.getByText(new RegExp(COMPANY.legalName))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(COMPANY.cnpj.replace(/[/.]/g, "\\$&")))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(COMPANY.address.replace(/[/.]/g, "\\$&")))).toBeInTheDocument();
  });

  it("mostra os mesmos dados de company.ts também em inglês (dados não traduzidos)", async () => {
    await i18n.changeLanguage("en");
    renderPrivacy();
    await screen.findByRole("heading", { level: 1, name: "Privacy Policy" });
    expect(screen.getByText(new RegExp(COMPANY.legalName))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(COMPANY.cnpj.replace(/[/.]/g, "\\$&")))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(COMPANY.address.replace(/[/.]/g, "\\$&")))).toBeInTheDocument();
  });
});
