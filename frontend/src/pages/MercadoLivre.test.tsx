import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import "../i18n";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MercadoLivre } from "./MercadoLivre";
import { ToastProvider } from "../components/Toast";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getMercadoLivreStatus: vi.fn(),
      connectMercadoLivre: vi.fn(),
      disconnectMercadoLivre: vi.fn(),
    },
  };
});

import { api, ApiError } from "../lib/api";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/mercadolivre"]}>
      <ToastProvider>
        <MercadoLivre />
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(api.getMercadoLivreStatus).mockReset();
  vi.mocked(api.connectMercadoLivre).mockReset();
  vi.mocked(api.disconnectMercadoLivre).mockReset();
  // jsdom não implementa navegação real; evita o erro "Not implemented" ao
  // atribuir window.location.href no clique de "Conectar".
  Object.defineProperty(window, "location", {
    value: { ...window.location, href: "" },
    writable: true,
  });
});

afterEach(() => {
  cleanup();
});

describe("MercadoLivre — seção do admin", () => {
  it("desconectado: mostra o status e o botão Conectar, que redireciona para a URL de autorização", async () => {
    vi.mocked(api.getMercadoLivreStatus).mockResolvedValue({ connected: false });
    vi.mocked(api.connectMercadoLivre).mockResolvedValue({
      url: "https://auth.mercadolivre.com.br/authorization?client_id=x",
      state: "state-123",
    });

    renderPage();

    expect(await screen.findByText(/não conectado/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /conectar com o mercado livre/i }));

    await waitFor(() => expect(api.connectMercadoLivre).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.location.href).toBe("https://auth.mercadolivre.com.br/authorization?client_id=x"));
  });

  it("conectado: mostra nickname, expiração e desconecta após confirmação", async () => {
    vi.mocked(api.getMercadoLivreStatus).mockResolvedValue({
      connected: true,
      mlUserId: "555",
      nickname: "LOJA_CINZEL_TESTE",
      expiresAt: "2026-12-01T00:00:00.000Z",
      scope: "offline_access read write",
    });
    vi.mocked(api.disconnectMercadoLivre).mockResolvedValue(undefined);

    renderPage();

    expect(await screen.findByText(/^conectado$/i)).toBeInTheDocument();
    expect(screen.getByText("LOJA_CINZEL_TESTE")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^desconectar$/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/desconectar do mercado livre/i);

    fireEvent.click(within(dialog).getByRole("button", { name: /^desconectar$/i }));

    await waitFor(() => expect(api.disconnectMercadoLivre).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/não conectado/i)).toBeInTheDocument();
  });

  it("erro ao carregar o status mostra um toast", async () => {
    vi.mocked(api.getMercadoLivreStatus).mockRejectedValue(new ApiError(500, "Erro interno do servidor"));

    renderPage();

    expect(await screen.findByText("Erro interno do servidor")).toBeInTheDocument();
  });
});
