import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../../i18n";
import { ContactModal } from "./ContactModal";

vi.mock("../../lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/analytics")>();
  return { ...actual, trackEvent: vi.fn() };
});

import { trackEvent } from "../../lib/analytics";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal(props: Partial<Parameters<typeof ContactModal>[0]> = {}, initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ContactModal
        open
        onClose={() => {}}
        whatsappHref="https://wa.me/5500000000000"
        contactEmail="cinzeleagema@gmail.com"
        {...props}
      />
    </MemoryRouter>
  );
}

describe("ContactModal", () => {
  it("não tem nenhum formulário — só os dois canais reais (WhatsApp e e-mail)", () => {
    renderModal();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar|send/i })).not.toBeInTheDocument();
  });

  it("link de WhatsApp aponta para o href recebido e dispara whatsapp_click (origin: contact_modal)", () => {
    renderModal({}, ["/catalogo"]);
    const whatsappLink = screen.getByRole("link", { name: /whatsapp/i });
    expect(whatsappLink).toHaveAttribute("href", "https://wa.me/5500000000000");

    fireEvent.click(whatsappLink);

    expect(trackEvent).toHaveBeenCalledWith("whatsapp_click", { origin: "contact_modal", page: "/catalogo" });
  });

  it("link de e-mail usa mailto: com o endereço real recebido", () => {
    renderModal({ contactEmail: "cinzeleagema@gmail.com" });
    const emailLink = screen.getByRole("link", { name: /cinzeleagema@gmail\.com/ });
    expect(emailLink).toHaveAttribute("href", "mailto:cinzeleagema@gmail.com");
  });

  it("sem whatsappHref, o link de WhatsApp não aparece (mas o de e-mail continua)", () => {
    renderModal({ whatsappHref: null });
    expect(screen.queryByRole("link", { name: /whatsapp/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cinzeleagema@gmail\.com/ })).toBeInTheDocument();
  });

  it("sem contactEmail, o link de e-mail não aparece (mas o de WhatsApp continua)", () => {
    renderModal({ contactEmail: undefined });
    expect(screen.queryByText("cinzeleagema@gmail.com")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /whatsapp/i })).toBeInTheDocument();
  });

  it("fechado, não renderiza nada", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
