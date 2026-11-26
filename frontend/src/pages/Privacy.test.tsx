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

const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL;
if (!CONTACT_EMAIL) throw new Error("VITE_CONTACT_EMAIL precisa estar configurado para este teste");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function expectedUpdatedAt(locale: string): string {
  return new Intl.DateTimeFormat(locale).format(new Date(2026, 10, 26));
}

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
  it("define title/description próprios e mostra as seções da política (inclusive as novas)", async () => {
    renderPrivacy();

    await screen.findByRole("heading", { level: 1, name: "Política de Privacidade" });
    expect(document.title).toBe("Política de Privacidade — Cinzel e a Gema");

    expect(screen.getByText("Quem é o controlador dos dados")).toBeInTheDocument();
    expect(screen.getByText("O que coletamos")).toBeInTheDocument();
    expect(screen.getByText("Dados que você informa ao fazer um pedido")).toBeInTheDocument();
    expect(screen.getByText("Cálculo de frete")).toBeInTheDocument();
    expect(screen.getByText("Consentimento e Google Consent Mode")).toBeInTheDocument();
    expect(screen.getByText("Como revisar sua escolha")).toBeInTheDocument();
    expect(screen.getByText("Com quem compartilhamos dados")).toBeInTheDocument();
    expect(screen.getByText("Transferência internacional")).toBeInTheDocument();
    expect(screen.getByText("Por quanto tempo guardamos os dados")).toBeInTheDocument();
    expect(screen.getByText("Seus direitos (LGPD)")).toBeInTheDocument();
    expect(screen.getByText("Não vendemos seus dados.")).toBeInTheDocument();
  });

  it("mostra as mesmas seções novas também em inglês", async () => {
    await i18n.changeLanguage("en");
    renderPrivacy();

    await screen.findByRole("heading", { level: 1, name: "Privacy Policy" });
    expect(screen.getByText("Data you provide when placing an order")).toBeInTheDocument();
    expect(screen.getByText("Shipping calculation")).toBeInTheDocument();
    expect(screen.getByText("Who we share data with")).toBeInTheDocument();
    expect(screen.getByText("International data transfer")).toBeInTheDocument();
    expect(screen.getByText("How long we keep your data")).toBeInTheDocument();
    expect(screen.getByText("We do not sell your data.")).toBeInTheDocument();
  });

  it("mostra o link 'Preferências de cookies' (reabre o banner), também nesta página", async () => {
    renderPrivacy();
    await screen.findByRole("heading", { level: 1, name: "Política de Privacidade" });
    expect(screen.getByRole("button", { name: "Preferências de cookies" })).toBeInTheDocument();
  });

  it("mostra razão social, CNPJ e endereço reais de company.ts (pt-BR)", async () => {
    renderPrivacy();
    await screen.findByRole("heading", { level: 1, name: "Política de Privacidade" });
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.legalName)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.cnpj)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.address)))).toBeInTheDocument();
  });

  it("mostra os mesmos dados de company.ts também em inglês (dados não traduzidos)", async () => {
    await i18n.changeLanguage("en");
    renderPrivacy();
    await screen.findByRole("heading", { level: 1, name: "Privacy Policy" });
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.legalName)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.cnpj)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.address)))).toBeInTheDocument();
  });

  it("mostra o e-mail de contato real (VITE_CONTACT_EMAIL), nunca um endereço fixo no texto", async () => {
    renderPrivacy();
    await screen.findByRole("heading", { level: 1, name: "Política de Privacidade" });
    const matches = screen.getAllByText(new RegExp(escapeRegExp(CONTACT_EMAIL)));
    expect(matches.length).toBeGreaterThanOrEqual(3); // controlador, direitos e contato
    expect(screen.queryByText(/cinzeleagema@gmail\.com/)).not.toBeInTheDocument();
  });

  it("mostra a data de atualização formatada por local (pt-BR dd/mm/aaaa)", async () => {
    renderPrivacy();
    await screen.findByRole("heading", { level: 1, name: "Política de Privacidade" });
    expect(screen.getByText(`Última atualização: ${expectedUpdatedAt("pt-BR")}`)).toBeInTheDocument();
  });

  it("mostra a data de atualização formatada no padrão local em inglês", async () => {
    await i18n.changeLanguage("en");
    renderPrivacy();
    await screen.findByRole("heading", { level: 1, name: "Privacy Policy" });
    expect(screen.getByText(`Last updated: ${expectedUpdatedAt("en")}`)).toBeInTheDocument();
  });
});
