import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../../i18n";
import { WhatsAppFloatingButton } from "./WhatsAppFloatingButton";

vi.mock("../../lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/analytics")>();
  return { ...actual, trackEvent: vi.fn() };
});

import { trackEvent } from "../../lib/analytics";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WhatsAppFloatingButton", () => {
  it("sem número configurado, não renderiza nada", () => {
    render(
      <MemoryRouter>
        <WhatsAppFloatingButton whatsappHref={null} />
      </MemoryRouter>
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("dispara whatsapp_click (origin: floating_button) com a página atual ao clicar", () => {
    render(
      <MemoryRouter initialEntries={["/catalogo"]}>
        <WhatsAppFloatingButton whatsappHref="https://wa.me/5500000000000" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("link"));

    expect(trackEvent).toHaveBeenCalledWith("whatsapp_click", { origin: "floating_button", page: "/catalogo" });
  });
});
