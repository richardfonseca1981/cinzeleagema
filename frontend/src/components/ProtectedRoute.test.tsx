import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { clearSession, setSession } from "../lib/auth";

// Em vez de um texto fixo, lê a querystring de verdade montada pelo
// ProtectedRoute — é isso que o teste abaixo precisa conferir.
function FakeLoginScreen() {
  const [searchParams] = useSearchParams();
  return <div>Tela de login — returnTo={searchParams.get("returnTo")}</div>;
}

function renderWithRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin" element={<FakeLoginScreen />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/admin/mercadolivre/callback" element={<div>Callback protegido</div>} />
          <Route path="/admin/produtos" element={<div>Produtos</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  clearSession();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("ProtectedRoute", () => {
  it("sem sessão, redireciona para /admin preservando path + querystring em ?returnTo=", async () => {
    renderWithRoute("/admin/mercadolivre/callback?code=TG-abc&state=xyz-state");

    expect(
      await screen.findByText("Tela de login — returnTo=/admin/mercadolivre/callback?code=TG-abc&state=xyz-state")
    ).toBeInTheDocument();
  });

  it("com sessão válida, renderiza a rota protegida normalmente", async () => {
    setSession({ token: "fake-token", admin: { id: "1", username: "admin", role: "admin" } });

    renderWithRoute("/admin/produtos");

    expect(await screen.findByText("Produtos")).toBeInTheDocument();
  });
});
