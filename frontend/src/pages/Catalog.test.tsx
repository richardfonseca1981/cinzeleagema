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

vi.mock("../lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/analytics")>();
  return { ...actual, trackEvent: vi.fn() };
});

import { api } from "../lib/api";
import { trackEvent } from "../lib/analytics";

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

  it("define title, description e canonical próprios da rota /catalogo, diferentes da home", async () => {
    renderCatalog();
    await screen.findByText("Ametista Grande");

    expect(document.title).toBe("Catálogo de pedras preciosas — Cinzel e a Gema");
    expect(document.title).not.toBe("Cinzel e a Gema — Pedras Preciosas");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://www.cinzeleagema.com.br/catalogo"
    );

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const jsonLd = Array.from(scripts).map((el) => JSON.parse(el.textContent ?? "{}"));
    expect(jsonLd).toContainEqual(expect.objectContaining({ "@type": "BreadcrumbList" }));
  });
});

describe("Catalog — eventos (GA4)", () => {
  it("submeter a busca dispara 'search' com o termo", async () => {
    renderCatalog();
    await screen.findByText("Ametista Grande");

    fireEvent.change(screen.getByRole("textbox", { name: "Pesquisar peças" }), { target: { value: "topazio" } });
    fireEvent.submit(screen.getByRole("search"));

    expect(trackEvent).toHaveBeenCalledWith("search", { search_term: "topazio" });
  });

  it("limpar a busca (termo vazio) NÃO dispara 'search'", async () => {
    renderCatalog(["/catalogo?q=ametista"]);
    await screen.findByText("Ametista Grande");
    vi.mocked(trackEvent).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));

    expect(trackEvent).not.toHaveBeenCalledWith("search", expect.anything());
  });

  it("selecionar categoria dispara 'catalog_filter' com filter_type 'category'", async () => {
    vi.mocked(api.listCategories).mockResolvedValue([
      { id: "cat1", name: "Pedras Brutas", slug: "pedras-brutas", subcategories: [] },
    ]);
    renderCatalog();
    await screen.findByText("Ametista Grande");

    fireEvent.click(await screen.findByText("Pedras Brutas"));

    expect(trackEvent).toHaveBeenCalledWith("catalog_filter", { filter_type: "category", value: "cat1" });
  });

  it("trocar a ordenação dispara 'catalog_filter' com filter_type 'sort'", async () => {
    renderCatalog();
    await screen.findByText("Ametista Grande");

    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "price_asc" } });

    expect(trackEvent).toHaveBeenCalledWith("catalog_filter", { filter_type: "sort", value: "price_asc" });
  });
});
