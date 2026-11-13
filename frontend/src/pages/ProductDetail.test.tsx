import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ProductDetail } from "./ProductDetail";
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
      getProductBySlug: vi.fn(),
    },
  };
});

import { api, ApiError } from "../lib/api";

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: "cm3x9f8s9f0000t3rggia1b2c3",
    name: "Ametista Bruta",
    slug: "ametista-bruta",
    description: null,
    nameEn: null,
    descriptionEn: null,
    categoryId: null,
    subcategoryId: null,
    category: null,
    subcategory: null,
    price: "1500",
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

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
}

function renderProductDetail(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <CartProvider>
        <ExchangeRateProvider>
          <ToastProvider>
            <Routes>
              <Route path="/catalogo/:slugComId" element={<ProductDetail />} />
            </Routes>
            <LocationDisplay />
          </ToastProvider>
        </ExchangeRateProvider>
      </CartProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProductDetail — slug", () => {
  it("carrega a peça pelo slug atual e não redireciona quando a URL já é a canônica", async () => {
    const product = makeProduct({});
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product, canonicalSlug: "ametista-bruta-a1b2c3" });

    renderProductDetail(["/catalogo/ametista-bruta-a1b2c3"]);

    await screen.findByText("Ametista Bruta");
    expect(api.getProductBySlug).toHaveBeenCalledWith("ametista-bruta-a1b2c3");
    expect(screen.getByTestId("location-display")).toHaveTextContent("/catalogo/ametista-bruta-a1b2c3");
  });

  it("URL antiga (cuid puro): acha a peça e redireciona para o slug atual (compatibilidade de link)", async () => {
    const product = makeProduct({});
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product, canonicalSlug: "ametista-bruta-a1b2c3" });

    renderProductDetail(["/catalogo/cm3x9f8s9f0000t3rggia1b2c3"]);

    await waitFor(() =>
      expect(screen.getByTestId("location-display")).toHaveTextContent("/catalogo/ametista-bruta-a1b2c3")
    );
  });

  it("peça renomeada: o slug antigo ainda acha a peça (sufixo do id) e redireciona para o slug novo", async () => {
    const renamed = makeProduct({ name: "Ametista Importada" });
    // O backend já devolveria a peça renomeada; o canonicalSlug reflete o NOME ATUAL.
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product: renamed, canonicalSlug: "ametista-importada-a1b2c3" });

    renderProductDetail(["/catalogo/ametista-bruta-a1b2c3"]);

    await waitFor(() =>
      expect(screen.getByTestId("location-display")).toHaveTextContent("/catalogo/ametista-importada-a1b2c3")
    );
  });

  it("peça não encontrada (404) mostra a mensagem de não encontrada", async () => {
    vi.mocked(api.getProductBySlug).mockRejectedValue(new ApiError(404, "Produto não encontrado"));

    renderProductDetail(["/catalogo/peca-inexistente-ffffff"]);

    await screen.findByText("Peça não encontrada.");
  });
});

describe("ProductDetail — SEO", () => {
  it("define title, description e canonical próprios da peça", async () => {
    const product = makeProduct({ name: "Ametista Bruta", weightGrams: "45", sizeCm: "3.2" });
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product, canonicalSlug: "ametista-bruta-a1b2c3" });

    renderProductDetail(["/catalogo/ametista-bruta-a1b2c3"]);
    await screen.findByText("Ametista Bruta");

    await waitFor(() => expect(document.title).toBe("Ametista Bruta — Cinzel e a Gema"));

    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    expect(description).toContain("Ametista Bruta");
    expect(description.toLowerCase()).not.toContain("cor");
    expect(description.toLowerCase()).not.toContain("tratamento");

    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://www.cinzeleagema.com.br/catalogo/ametista-bruta-a1b2c3"
    );
  });
});
