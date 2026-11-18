import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import "../i18n";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MercadoLivreCallback } from "./MercadoLivreCallback";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      handleMercadoLivreCallback: vi.fn(),
    },
  };
});

import { api, ApiError } from "../lib/api";

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MercadoLivreCallback />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(api.handleMercadoLivreCallback).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("MercadoLivreCallback", () => {
  it("sem code/state na URL, mostra erro sem chamar a API", async () => {
    renderPage("/admin/mercadolivre/callback");

    expect(await screen.findByRole("alert")).toHaveTextContent(/link de retorno inválido/i);
    expect(api.handleMercadoLivreCallback).not.toHaveBeenCalled();
  });

  it("sucesso: chama a API com code/state e mostra a conta conectada", async () => {
    vi.mocked(api.handleMercadoLivreCallback).mockResolvedValue({
      connected: true,
      mlUserId: "555",
      nickname: "LOJA_CINZEL_TESTE",
      expiresAt: "2026-12-01T00:00:00.000Z",
      scope: "offline_access read write",
    });

    renderPage("/admin/mercadolivre/callback?code=TG-abc&state=xyz-state");

    await waitFor(() => expect(api.handleMercadoLivreCallback).toHaveBeenCalledWith("TG-abc", "xyz-state"));
    expect(await screen.findByText(/conta conectada com sucesso/i)).toBeInTheDocument();
    expect(screen.getByText(/LOJA_CINZEL_TESTE/)).toBeInTheDocument();
  });

  it("erro retornado pelo backend é exibido ao usuário", async () => {
    vi.mocked(api.handleMercadoLivreCallback).mockRejectedValue(
      new ApiError(403, "Esta autorização foi iniciada por outro admin — reinicie a conexão")
    );

    renderPage("/admin/mercadolivre/callback?code=TG-abc&state=xyz-state");

    expect(await screen.findByRole("alert")).toHaveTextContent(/iniciada por outro admin/i);
  });

  it("sessão expirada (401): mostra mensagem clara e um link para logar de novo, sem o botão genérico", async () => {
    vi.mocked(api.handleMercadoLivreCallback).mockRejectedValue(new ApiError(401, "Sessão expirada"));

    renderPage("/admin/mercadolivre/callback?code=TG-abc&state=xyz-state");

    expect(await screen.findByRole("alert")).toHaveTextContent(/sessão expirou/i);
    expect(screen.queryByRole("button", { name: /voltar para o painel/i })).not.toBeInTheDocument();

    const loginLink = screen.getByRole("link", { name: /fazer login novamente/i });
    expect(loginLink).toHaveAttribute("href", "/admin?returnTo=%2Fadmin%2Fmercadolivre");
  });
});
