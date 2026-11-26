import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../i18n";
import { ExchangePolicy } from "./ExchangePolicy";
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
    <MemoryRouter initialEntries={["/troca-e-devolucao"]}>
      <ConsentProvider>
        <CartProvider>
          <ExchangeRateProvider>
            <ToastProvider>
              <ExchangePolicy />
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

describe("ExchangePolicy", () => {
  it("define title e mostra as seções da política (pt-BR)", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Política de Troca e Devolução" });
    expect(document.title).toBe("Política de Troca e Devolução — Cinzel e a Gema");

    expect(screen.getByText(/1\. Direito de arrependimento/)).toBeInTheDocument();
    expect(screen.getByText(/2\. Peça com defeito/)).toBeInTheDocument();
    expect(screen.getByText("3. O que não caracteriza defeito")).toBeInTheDocument();
    expect(screen.getByText("4. Troca voluntária")).toBeInTheDocument();
    expect(screen.getByText(/5\. Peças sob encomenda/)).toBeInTheDocument();
    expect(screen.getByText("6. Como solicitar")).toBeInTheDocument();
  });

  it("interpola razão social, CNPJ, endereço, e-mail e WhatsApp reais (pt-BR)", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.legalName)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.cnpj)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.address)))).toBeInTheDocument();
    // E-mail aparece 3x nesta página (atendimento, pedido de arrependimento,
    // "como solicitar") — getAllByText em vez de getByText.
    expect(screen.getAllByText(new RegExp(escapeRegExp(CONTACT_EMAIL))).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(new RegExp(escapeRegExp(WHATSAPP_NUMBER)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(LEGAL_POLICY.serviceHours["pt-BR"])))).toBeInTheDocument();
  });

  it("interpola os prazos de legalPolicy.ts no texto (pt-BR)", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText(new RegExp(`${LEGAL_POLICY.withdrawalDays} dias corridos`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Respondemos em até ${LEGAL_POLICY.responseBusinessDays} dias úteis`))).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`em até ${LEGAL_POLICY.refundBusinessDays} dias úteis, pela mesma forma de pagamento`))
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`em até ${LEGAL_POLICY.defectNoticeDays} dias da entrega`))).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Analisamos o caso em até ${LEGAL_POLICY.defectAnalysisBusinessDays} dias úteis`))
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`em até ${LEGAL_POLICY.voluntaryExchangeDays} dias,`))).toBeInTheDocument();
  });

  it("não sobra nenhum '[' ou ']' no texto renderizado (pt-BR)", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(document.body.textContent).not.toMatch(/[[\]]/);
  });

  it("mostra as mesmas seções, dados e sem colchetes também em inglês", async () => {
    await i18n.changeLanguage("en");
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Return and Exchange Policy" });

    expect(screen.getByText("In case of any divergence, the Portuguese version prevails.")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(COMPANY.legalName)))).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(escapeRegExp(CONTACT_EMAIL))).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(new RegExp(escapeRegExp(WHATSAPP_NUMBER)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(escapeRegExp(LEGAL_POLICY.serviceHours.en)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`within ${LEGAL_POLICY.withdrawalDays} calendar days`))).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[[\]]/);
  });

  it("fora da versão em inglês, não mostra o aviso de prevalência do português (pt-BR)", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/Portuguese version prevails/)).not.toBeInTheDocument();
  });
});
