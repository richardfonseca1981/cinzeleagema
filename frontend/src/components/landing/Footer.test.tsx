import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../../i18n";
import i18n from "../../i18n";
import { ConsentProvider } from "../../lib/consent";
import { COMPANY } from "../../config/company";
import { Footer } from "./Footer";

vi.mock("../../lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/analytics")>();
  return { ...actual, trackEvent: vi.fn() };
});

import { trackEvent } from "../../lib/analytics";

afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await i18n.changeLanguage("pt-BR");
});

function renderFooter(props: Partial<Parameters<typeof Footer>[0]> = {}, initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ConsentProvider>
        <Footer
          whatsappHref="https://wa.me/5500000000000"
          whatsappNumber="(00) 00000-0000"
          contactEmail="cinzeleagema@gmail.com"
          onOpenQualityPolicy={() => {}}
          {...props}
        />
      </ConsentProvider>
    </MemoryRouter>
  );
}

describe("Footer", () => {
  it("link de WhatsApp dispara whatsapp_click (origin: footer) com a página atual", () => {
    renderFooter({}, ["/catalogo"]);
    const whatsappLink = screen.getByRole("link", { name: /\(00\) 00000-0000/ });

    fireEvent.click(whatsappLink);

    expect(trackEvent).toHaveBeenCalledWith("whatsapp_click", { origin: "footer", page: "/catalogo" });
  });

  it("link de e-mail dispara email_click (origin: footer), sem o endereço como parâmetro", () => {
    renderFooter({}, ["/catalogo"]);
    const emailLink = screen.getByRole("link", { name: /cinzeleagema@gmail\.com/ });

    fireEvent.click(emailLink);

    expect(trackEvent).toHaveBeenCalledWith("email_click", { origin: "footer", page: "/catalogo" });
    const [, params] = vi.mocked(trackEvent).mock.calls[0];
    expect(params).not.toHaveProperty("email");
    expect(JSON.stringify(params)).not.toContain("cinzeleagema@gmail.com");
  });

  it("sem whatsappHref/whatsappNumber, o link de WhatsApp não aparece (mas o de e-mail continua)", () => {
    renderFooter({ whatsappHref: null, whatsappNumber: undefined });
    expect(screen.queryByRole("link", { name: /00000-0000/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cinzeleagema@gmail\.com/ })).toBeInTheDocument();
  });

  it("sem contactEmail, o link de e-mail não aparece (mas o de WhatsApp continua)", () => {
    renderFooter({ contactEmail: undefined });
    expect(screen.queryByText("cinzeleagema@gmail.com")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /\(00\) 00000-0000/ })).toBeInTheDocument();
  });

  it("mostra razão social, CNPJ e endereço reais (pt-BR), como texto (sem link)", () => {
    renderFooter();
    const expected = `${COMPANY.legalName} · CNPJ ${COMPANY.cnpj} · ${COMPANY.address}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("mostra razão social, CNPJ e endereço reais também em inglês (dados não traduzidos)", async () => {
    await i18n.changeLanguage("en");
    renderFooter();
    const expected = `${COMPANY.legalName} · CNPJ ${COMPANY.cnpj} · ${COMPANY.address}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("tem os links de Política de Troca e Devolução e Termos de Venda, ao lado do de privacidade", () => {
    renderFooter();
    expect(screen.getByRole("link", { name: "Política de Troca e Devolução" })).toHaveAttribute(
      "href",
      "/troca-e-devolucao"
    );
    expect(screen.getByRole("link", { name: "Termos de Venda" })).toHaveAttribute("href", "/termos-de-venda");
    expect(screen.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/privacidade");
  });
});
