import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import { WhatsAppGroupMarquee } from "./WhatsAppGroupMarquee";

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await i18n.changeLanguage("pt-BR");
});

describe("WhatsAppGroupMarquee", () => {
  it("renderiza como link do grupo, em nova aba com rel seguro, com o texto em PT (lido uma vez)", () => {
    render(<WhatsAppGroupMarquee />);

    const link = screen.getByRole("link", { name: "Entrar no grupo de ofertas exclusivas no WhatsApp (abre em nova aba)" });
    expect(link).toHaveAttribute("href", "https://chat.whatsapp.com/KN60WlSdW9K9yQNLna5kHy");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    const message = "Entre no nosso grupo de ofertas exclusivas no WhatsApp • Novidades e peças antes de todo mundo • Clique e participe";
    expect(screen.getAllByText(message)).toHaveLength(2); // texto real + cópia aria-hidden (loop)
    expect(screen.getByText(message, { selector: "[aria-hidden='true']" })).toBeInTheDocument();
  });

  it("mostra o texto em EN quando o idioma é inglês", async () => {
    await i18n.changeLanguage("en");
    render(<WhatsAppGroupMarquee />);

    expect(screen.getByRole("link", { name: "Join our exclusive offers WhatsApp group (opens in a new tab)" })).toBeInTheDocument();
    expect(screen.getAllByText(/Join our exclusive offers group on WhatsApp/).length).toBeGreaterThan(0);
  });

  it("com prefers-reduced-motion, mostra o texto estático uma única vez (sem a cópia animada)", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList);

    render(<WhatsAppGroupMarquee />);

    const message = "Entre no nosso grupo de ofertas exclusivas no WhatsApp • Novidades e peças antes de todo mundo • Clique e participe";
    expect(screen.getAllByText(message)).toHaveLength(1);
    expect(screen.queryByText(message, { selector: "[aria-hidden='true']" })).not.toBeInTheDocument();
  });
});
