import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { Catalog } from "./Catalog";
import { CartProvider } from "../lib/cart";
import { ExchangeRateProvider } from "../lib/exchangeRate";
import { ToastProvider } from "../components/Toast";
import type { Product } from "../types";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listCategories: vi.fn().mockResolvedValue([]),
      listProducts: vi.fn(),
    },
  };
});

import { api } from "../lib/api";

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: "id-1",
    name: "Ametista Grande",
    slug: "ametista-grande",
    description: null,
    nameEn: null,
    descriptionEn: null,
    categoryId: null,
    subcategoryId: null,
    category: null,
    subcategory: null,
    price: "100",
    sku: null,
    weightGrams: "0",
    sizeCm: "0",
    packageLengthCm: null,
    packageWidthCm: null,
    packageHeightCm: null,
    trackStock: false,
    stockQty: null,
    images: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// Exibe pathname+search para asserções de URL — a MemoryRouter não expõe o
// histórico diretamente, então um observador dentro da mesma árvore é o jeito
// mais simples de confirmar que ?q= foi escrito/removido.
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname + location.search}</div>;
}

function renderCatalog(initialEntries: string[] = ["/catalogo"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <CartProvider>
        <ExchangeRateProvider>
          <ToastProvider>
            <Catalog />
            <LocationDisplay />
          </ToastProvider>
        </ExchangeRateProvider>
      </CartProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(api.listProducts).mockResolvedValue({
    items: [makeProduct({})],
    total: 1,
    page: 1,
    pageSize: 20,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Catalog — busca", () => {
  it("lê ?q= da URL, preenche o campo e mostra a contagem de resultados", async () => {
    renderCatalog(["/catalogo?q=ametista"]);

    const input = await screen.findByRole("textbox", { name: "Pesquisar peças" });
    expect(input).toHaveValue("ametista");
    await waitFor(() => expect(api.listProducts).toHaveBeenCalledWith(expect.objectContaining({ q: "ametista" })));
    await screen.findByText("1 resultado para “ametista”");
  });

  it("envia a busca ao submeter o formulário (Enter) e atualiza a URL", async () => {
    renderCatalog();
    await screen.findByText("Ametista Grande");

    const input = screen.getByRole("textbox", { name: "Pesquisar peças" });
    fireEvent.change(input, { target: { value: "topazio" } });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => expect(screen.getByTestId("location-display")).toHaveTextContent("/catalogo?q=topazio"));
    await waitFor(() => expect(api.listProducts).toHaveBeenCalledWith(expect.objectContaining({ q: "topazio", page: 1 })));
  });

  it("envia a busca ao clicar no botão Pesquisar e atualiza a URL", async () => {
    renderCatalog();
    await screen.findByText("Ametista Grande");

    const input = screen.getByRole("textbox", { name: "Pesquisar peças" });
    fireEvent.change(input, { target: { value: "quartzo" } });
    fireEvent.click(screen.getByRole("button", { name: "Pesquisar" }));

    await waitFor(() => expect(screen.getByTestId("location-display")).toHaveTextContent("/catalogo?q=quartzo"));
    await waitFor(() => expect(api.listProducts).toHaveBeenCalledWith(expect.objectContaining({ q: "quartzo", page: 1 })));
  });

  it('botão "limpar" (x) some sem texto e remove o q da URL ao clicar', async () => {
    renderCatalog(["/catalogo?q=ametista"]);
    await screen.findByText("Ametista Grande");

    const clearButton = screen.getByRole("button", { name: "Limpar busca" });
    fireEvent.click(clearButton);

    await waitFor(() => expect(screen.getByTestId("location-display")).toHaveTextContent("/catalogo"));
    await waitFor(() => expect(screen.getByTestId("location-display")).not.toHaveTextContent("q="));
    expect(screen.queryByRole("button", { name: "Limpar busca" })).not.toBeInTheDocument();
  });

  it('existe um único botão "limpar" (o nativo do input foi trocado por type="text")', async () => {
    renderCatalog(["/catalogo?q=ametista"]);
    await screen.findByText("Ametista Grande");

    expect(screen.getAllByRole("button", { name: "Limpar busca" })).toHaveLength(1);

    const input = screen.getByRole("textbox", { name: "Pesquisar peças" });
    expect(input).toHaveAttribute("type", "text");
  });

  it("esvaziar o campo (ex.: apagar tudo) com q ativo remove o q da URL e recarrega a lista", async () => {
    renderCatalog(["/catalogo?q=ametista"]);
    await screen.findByText("Ametista Grande");
    vi.mocked(api.listProducts).mockClear();

    const input = screen.getByRole("textbox", { name: "Pesquisar peças" });
    fireEvent.change(input, { target: { value: "" } });

    await waitFor(() => expect(screen.getByTestId("location-display")).toHaveTextContent("/catalogo"));
    await waitFor(() => expect(screen.getByTestId("location-display")).not.toHaveTextContent("q="));
    await waitFor(() => expect(api.listProducts).toHaveBeenCalledWith(expect.objectContaining({ q: undefined })));
  });

  it("digitar normalmente não dispara busca nem muda a URL a cada tecla", async () => {
    renderCatalog();
    await screen.findByText("Ametista Grande");
    vi.mocked(api.listProducts).mockClear();

    const input = screen.getByRole("textbox", { name: "Pesquisar peças" });
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "am" } });
    fireEvent.change(input, { target: { value: "ame" } });

    expect(api.listProducts).not.toHaveBeenCalled();
    expect(screen.getByTestId("location-display")).not.toHaveTextContent("q=");
  });

  it("sem resultados mostra mensagem amigável com ações de limpar busca e ver todas as peças", async () => {
    vi.mocked(api.listProducts).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    renderCatalog(["/catalogo?q=zzzz"]);

    await screen.findByText("Nenhum resultado para “zzzz”.");
    expect(screen.getByRole("button", { name: "Ver todas as peças" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver todas as peças" }));
    await waitFor(() => expect(screen.getByTestId("location-display")).toHaveTextContent("/catalogo"));
    await waitFor(() => expect(screen.getByTestId("location-display")).not.toHaveTextContent("q="));
  });
});
