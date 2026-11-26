import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../i18n";
import { SaleTerms } from "./SaleTerms";
import { CartProvider } from "../lib/cart";
import { ConsentProvider } from "../lib/consent";
import { ExchangeRateProvider } from "../lib/exchangeRate";
import { ToastProvider } from "../components/Toast";
import { COMPANY } from "../config/company";
import { LEGAL_POLICY } from "../config/legalPolicy";

const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL;
const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER;
if (!CONTACT_EMAIL) throw new Error("VITE_CONTACT_EMAIL precisa estar configurado para este teste");
if (!WHATSAPP_NUMBER) throw new Error("VITE_WHATSAPP_NUMBER precisa estar configurado para este teste");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/termos-de-venda"]}>
      <ConsentProvider>
        <CartProvider>
          <ExchangeRateProvider>
            <ToastProvider>
              <SaleTerms />
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

describe("SaleTerms", () => {
  it("define title e mostra as seções dos termos (pt-BR)", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Termos de Venda" });
    expect(document.title).toBe("Termos de Venda — Cinzel e a Gema");

    expect(screen.getByText("1. Quem somos")).toBeInTheDocument();
    expect(screen.getByText("2. Produtos")).toBeInTheDocument();
    expect(screen.getByText(/3\. Preços, disponibilidade e pagamento/)).toBeInTheDocument();
    expect(screen.getByText("4. Frete e prazos")).toBeInTheDocument();
    expect(screen.getByText(/5\. Troca, devolução e cancelamento/)).toBeInTheDocument();
    expect(screen.getByText("6. Privacidade")).toBeInTheDocument();
    expect(screen.getByText(/7\. Alterações destes termos/)).toBeInTheDocument();
    expect(screen.getByText("8. Foro")).toBeInTheDocument();
  });

  it("interpola razão social, CNPJ, endereço, e-mail, WhatsApp e horário reais (pt-BR)", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.legalName)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.cnpj)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.address)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(CONTACT_EMAIL)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(WHATSAPP_NUMBER)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(LEGAL_POLICY.serviceHours["pt-BR"])))).toBeInTheDocument();
  });

  it("interpola parcelamento e os prazos de legalPolicy.ts (pt-BR)", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText(new RegExp(escapeRegExp(LEGAL_POLICY.installments["pt-BR"])))).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`devolvemos o valor integral em até ${LEGAL_POLICY.refundBusinessDays} dias úteis`))
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Postamos em até ${LEGAL_POLICY.shippingBusinessDays} dias úteis`))
    ).toBeInTheDocument();
  });

  it("explica que o pagamento é combinado por WhatsApp depois do pedido (pt-BR)", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(
      screen.getByText(/o pagamento é combinado com nossa equipe pelo WhatsApp depois que você envia o pedido pelo site/)
    ).toBeInTheDocument();
  });

  it("tem links reais para a Política de Troca e para a Política de Privacidade", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    const exchangeLink = screen.getByRole("link", { name: "Política de Troca e Devolução" });
    expect(exchangeLink).toHaveAttribute("href", "/troca-e-devolucao");
    const privacyLink = screen.getByRole("link", { name: "Política de Privacidade" });
    expect(privacyLink).toHaveAttribute("href", "/privacidade");
  });

  it("não sobra nenhum '[' ou ']' no texto renderizado (pt-BR)", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(document.body.textContent).not.toMatch(/[[\]]/);
  });

  it("mostra as mesmas seções, links e dados também em inglês, sem colchetes", async () => {
    await i18n.changeLanguage("en");
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Terms of Sale" });

    expect(screen.getByText("In case of any divergence, the Portuguese version prevails.")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(LEGAL_POLICY.installments.en)))).toBeInTheDocument();
    expect(
      screen.getByText(/payment is arranged with our team over WhatsApp after you place your order on the site/)
    ).toBeInTheDocument();
    const exchangeLink = screen.getByRole("link", { name: "Return and Exchange Policy" });
    expect(exchangeLink).toHaveAttribute("href", "/troca-e-devolucao");
    const privacyLink = screen.getByRole("link", { name: "Privacy Policy" });
    expect(privacyLink).toHaveAttribute("href", "/privacidade");
    expect(document.body.textContent).not.toMatch(/[[\]]/);
  });
});
