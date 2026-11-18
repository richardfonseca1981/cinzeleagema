import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Login } from "./Login";
import { clearSession, setSession } from "../lib/auth";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: { ...actual.api, login: vi.fn() },
  };
});

import { api } from "../lib/api";

function renderLogin(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<Login />} />
        <Route path="/admin/produtos" element={<div>Tela de produtos</div>} />
        <Route path="/admin/mercadolivre" element={<div>Painel do Mercado Livre</div>} />
        <Route path="/admin/mercadolivre/callback" element={<div>Callback do Mercado Livre</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function fillAndSubmit(container: HTMLElement) {
  const username = container.querySelector('input[type="text"]') as HTMLInputElement;
  const password = container.querySelector('input[type="password"]') as HTMLInputElement;
  fireEvent.change(username, { target: { value: "admin" } });
  fireEvent.change(password, { target: { value: "senha123" } });
  fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
}

beforeEach(() => {
  clearSession();
  vi.mocked(api.login).mockReset();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("Login — returnTo", () => {
  it("sem sessão: após login, navega para o returnTo preservado (ex.: o callback do Mercado Livre com code/state)", async () => {
    vi.mocked(api.login).mockResolvedValue({ token: "tok", admin: { id: "1", username: "admin", role: "admin" } });

    const { container } = renderLogin("/admin?returnTo=%2Fadmin%2Fmercadolivre%2Fcallback%3Fcode%3DTG-abc%26state%3Dxyz");
    fillAndSubmit(container);

    expect(await screen.findByText("Callback do Mercado Livre")).toBeInTheDocument();
  });

  it("já com sessão válida: redireciona direto para o returnTo, sem precisar submeter o form", async () => {
    setSession({ token: "tok", admin: { id: "1", username: "admin", role: "admin" } });

    renderLogin("/admin?returnTo=%2Fadmin%2Fmercadolivre");

    expect(await screen.findByText("Painel do Mercado Livre")).toBeInTheDocument();
  });

  it("returnTo fora de /admin/ (tentativa de open redirect) é ignorado — cai no padrão /admin/produtos", async () => {
    vi.mocked(api.login).mockResolvedValue({ token: "tok", admin: { id: "1", username: "admin", role: "admin" } });

    const { container } = renderLogin("/admin?returnTo=https%3A%2F%2Fevil.example.com");
    fillAndSubmit(container);

    expect(await screen.findByText("Tela de produtos")).toBeInTheDocument();
  });

  it("sem returnTo na URL: comportamento padrão continua indo para /admin/produtos", async () => {
    vi.mocked(api.login).mockResolvedValue({ token: "tok", admin: { id: "1", username: "admin", role: "admin" } });

    const { container } = renderLogin("/admin");
    fillAndSubmit(container);

    expect(await screen.findByText("Tela de produtos")).toBeInTheDocument();
  });
});
