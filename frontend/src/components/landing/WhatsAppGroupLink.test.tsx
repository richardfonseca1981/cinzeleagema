import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import { WhatsAppGroupLink } from "./WhatsAppGroupLink";

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("pt-BR");
});

describe("WhatsAppGroupLink", () => {
  it("aponta para o grupo, abre em nova aba com rel seguro e mostra o texto em PT", () => {
    render(<WhatsAppGroupLink className="" />);

    const link = screen.getByRole("link", { name: "Entre no grupo de ofertas exclusivas" });
    expect(link).toHaveAttribute("href", "https://chat.whatsapp.com/KN60WlSdW9K9yQNLna5kHy");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("Entre no grupo de ofertas exclusivas");
  });

  it("mostra o texto em EN quando o idioma é inglês", async () => {
    await i18n.changeLanguage("en");
    render(<WhatsAppGroupLink className="" />);

    expect(screen.getByRole("link", { name: "Join our exclusive offers group" })).toBeInTheDocument();
  });
});
