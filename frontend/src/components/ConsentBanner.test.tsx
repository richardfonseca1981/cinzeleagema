import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../i18n";
import { ConsentBanner } from "./ConsentBanner";
import { ConsentProvider } from "../lib/consent";

vi.mock("../lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/analytics")>();
  return { ...actual, updateConsent: vi.fn() };
});

function renderBanner(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ConsentProvider>
        <ConsentBanner />
      </ConsentProvider>
    </MemoryRouter>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("ConsentBanner", () => {
  it("sem escolha salva, aparece com Aceitar e Rejeitar com o MESMO destaque visual", () => {
    renderBanner();

    const reject = screen.getByTestId("consent-reject");
    const accept = screen.getByTestId("consent-accept");
    expect(reject).toBeInTheDocument();
    expect(accept).toBeInTheDocument();
    // Nenhum dos dois é "primário" — mesma classe exata nos dois (ver decisão
    // do usuário em CONTEXT.md "SEO — Rodada 3": não induzir ao aceite).
    expect(reject.className).toBe(accept.className);
  });

  it("clicar em Aceitar fecha o banner", () => {
    renderBanner();
    fireEvent.click(screen.getByTestId("consent-accept"));
    expect(screen.queryByTestId("consent-accept")).not.toBeInTheDocument();
  });

  it("clicar em Rejeitar fecha o banner", () => {
    renderBanner();
    fireEvent.click(screen.getByTestId("consent-reject"));
    expect(screen.queryByTestId("consent-reject")).not.toBeInTheDocument();
  });

  it("nunca aparece em rota /admin, mesmo sem escolha salva", () => {
    renderBanner(["/admin/produtos"]);
    expect(screen.queryByTestId("consent-accept")).not.toBeInTheDocument();
    expect(screen.queryByTestId("consent-reject")).not.toBeInTheDocument();
  });

  it("com escolha já salva, não aparece sozinho (só via reopen)", () => {
    localStorage.setItem("cinzeleagema_consent", JSON.stringify({ choice: "granted", timestamp: "2026-01-01T00:00:00.000Z" }));
    renderBanner();
    expect(screen.queryByTestId("consent-accept")).not.toBeInTheDocument();
  });
});
