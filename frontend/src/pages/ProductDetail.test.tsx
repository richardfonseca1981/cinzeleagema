import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("../lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/analytics")>();
  return { ...actual, trackEvent: vi.fn() };
});

import { api, ApiError } from "../lib/api";
import { trackEvent } from "../lib/analytics";

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
  return (
    <div data-testid="location-display">
      {location.pathname}
      {location.search}
    </div>
  );
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
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product, canonicalSlug: "ametista-bruta-a1b2c3", available: true });

    renderProductDetail(["/catalogo/ametista-bruta-a1b2c3"]);

    await screen.findByText("Ametista Bruta");
    expect(api.getProductBySlug).toHaveBeenCalledWith("ametista-bruta-a1b2c3");
    expect(screen.getByTestId("location-display")).toHaveTextContent("/catalogo/ametista-bruta-a1b2c3");
  });

  it("URL antiga (cuid puro): acha a peça e redireciona para o slug atual (compatibilidade de link)", async () => {
    const product = makeProduct({});
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product, canonicalSlug: "ametista-bruta-a1b2c3", available: true });

    renderProductDetail(["/catalogo/cm3x9f8s9f0000t3rggia1b2c3"]);

    await waitFor(() =>
      expect(screen.getByTestId("location-display")).toHaveTextContent("/catalogo/ametista-bruta-a1b2c3")
    );
  });

  it("peça renomeada: o slug antigo ainda acha a peça (sufixo do id) e redireciona para o slug novo", async () => {
    const renamed = makeProduct({ name: "Ametista Importada" });
    // O backend já devolveria a peça renomeada; o canonicalSlug reflete o NOME ATUAL.
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product: renamed, canonicalSlug: "ametista-importada-a1b2c3", available: true });

    renderProductDetail(["/catalogo/ametista-bruta-a1b2c3"]);

    await waitFor(() =>
      expect(screen.getByTestId("location-display")).toHaveTextContent("/catalogo/ametista-importada-a1b2c3")
    );
  });

  it("redirect pro slug canônico preserva utm_* da URL (ver lib/utm.ts)", async () => {
    const renamed = makeProduct({ name: "Ametista Importada" });
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product: renamed, canonicalSlug: "ametista-importada-a1b2c3", available: true });

    renderProductDetail(["/catalogo/ametista-bruta-a1b2c3?utm_source=instagram&utm_medium=social"]);

    await waitFor(() =>
      expect(screen.getByTestId("location-display")).toHaveTextContent(
        "/catalogo/ametista-importada-a1b2c3?utm_source=instagram&utm_medium=social"
      )
    );
  });

  it("URL já canônica com utm_*: não redireciona e a query string permanece intacta", async () => {
    const product = makeProduct({});
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product, canonicalSlug: "ametista-bruta-a1b2c3", available: true });

    renderProductDetail(["/catalogo/ametista-bruta-a1b2c3?utm_source=whatsapp"]);

    await screen.findByText("Ametista Bruta");
    expect(screen.getByTestId("location-display")).toHaveTextContent("/catalogo/ametista-bruta-a1b2c3?utm_source=whatsapp");
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
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product, canonicalSlug: "ametista-bruta-a1b2c3", available: true });

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

    expect(document.querySelector('meta[name="robots"]')).toBeNull();

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const jsonLd = Array.from(scripts).map((el) => JSON.parse(el.textContent ?? "{}"));
    expect(jsonLd).toContainEqual(expect.objectContaining({ "@type": "BreadcrumbList" }));
    expect(jsonLd).toContainEqual(
      expect.objectContaining({ "@type": "Product", name: "Ametista Bruta" })
    );
  });

  it("description do Product JSON-LD usa nome + categoria + peso/tamanho, nunca product.description", async () => {
    const product = makeProduct({
      name: "Drusa de Ametista",
      description: "Curadoria Exclusiva – Exemplar Único.\nTexto repetido em várias peças.",
      weightGrams: "2770",
      sizeCm: "22",
      category: { id: "cat1", name: "Pedras Brutas", slug: "pedras-brutas" },
    });
    vi.mocked(api.getProductBySlug).mockResolvedValue({
      product,
      canonicalSlug: "drusa-de-ametista-a1b2c3",
      available: true,
    });

    renderProductDetail(["/catalogo/drusa-de-ametista-a1b2c3"]);
    await screen.findByText("Drusa de Ametista");

    await waitFor(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      const jsonLd = Array.from(scripts).map((el) => JSON.parse(el.textContent ?? "{}"));
      const productJsonLd = jsonLd.find((entry) => entry["@type"] === "Product");
      expect(productJsonLd?.description).toBe("Drusa de Ametista · Pedras Brutas · 2,770kg · 22cm");
    });
  });

  it("peça indisponível (available=false): noindex e sem Product JSON-LD", async () => {
    const product = makeProduct({ name: "Peça Vendida" });
    vi.mocked(api.getProductBySlug).mockResolvedValue({
      product,
      canonicalSlug: "peca-vendida-a1b2c3",
      available: false,
    });

    renderProductDetail(["/catalogo/peca-vendida-a1b2c3"]);
    await screen.findByText("Peça Vendida");

    await waitFor(() =>
      expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, follow")
    );

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const jsonLd = Array.from(scripts).map((el) => JSON.parse(el.textContent ?? "{}"));
    expect(jsonLd).not.toContainEqual(expect.objectContaining({ "@type": "Product" }));
  });

  it("peça sem preço (\"Consulte o valor\"): sem Product JSON-LD mesmo disponível", async () => {
    const product = makeProduct({ name: "Esfera de Ágata", price: null });
    vi.mocked(api.getProductBySlug).mockResolvedValue({
      product,
      canonicalSlug: "esfera-de-agata-a1b2c3",
      available: true,
    });

    renderProductDetail(["/catalogo/esfera-de-agata-a1b2c3"]);
    await screen.findByText("Esfera de Ágata");

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const jsonLd = Array.from(scripts).map((el) => JSON.parse(el.textContent ?? "{}"));
    expect(jsonLd).not.toContainEqual(expect.objectContaining({ "@type": "Product" }));
  });
});

describe("ProductDetail — eventos (GA4)", () => {
  it("dispara view_item ao carregar a peça, com categoria e preço", async () => {
    const product = makeProduct({
      name: "Drusa de Ametista",
      sku: "SKU-1",
      price: "610",
      category: { id: "cat1", name: "Pedras Brutas", slug: "pedras-brutas" },
    });
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product, canonicalSlug: "drusa-de-ametista-a1b2c3", available: true });

    renderProductDetail(["/catalogo/drusa-de-ametista-a1b2c3"]);
    await screen.findByText("Drusa de Ametista");

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith("view_item", {
        item_id: "SKU-1",
        item_name: "Drusa de Ametista",
        item_category: "Pedras Brutas",
        price: 610,
        currency: "BRL",
      })
    );
  });

  it("peça sem preço: view_item não inclui price/currency", async () => {
    const product = makeProduct({ name: "Esfera de Ágata", price: null, sku: null });
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product, canonicalSlug: "esfera-de-agata-a1b2c3", available: true });

    renderProductDetail(["/catalogo/esfera-de-agata-a1b2c3"]);
    await screen.findByText("Esfera de Ágata");

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith("view_item", {
        item_id: product.id,
        item_name: "Esfera de Ágata",
        item_category: null,
      })
    );
  });

  it("dispara add_to_cart ao clicar em Adicionar ao pedido, com a quantidade escolhida", async () => {
    const product = makeProduct({ name: "Drusa de Ametista", sku: "SKU-1", price: "610" });
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product, canonicalSlug: "drusa-de-ametista-a1b2c3", available: true });

    renderProductDetail(["/catalogo/drusa-de-ametista-a1b2c3"]);
    await screen.findByText("Drusa de Ametista");
    vi.mocked(trackEvent).mockClear(); // descarta o view_item do load, foco no clique

    fireEvent.click(screen.getByText("Adicionar ao pedido"));

    expect(trackEvent).toHaveBeenCalledWith("add_to_cart", {
      item_id: "SKU-1",
      item_name: "Drusa de Ametista",
      price: 610,
      currency: "BRL",
      quantity: 1,
    });
  });

  it("dispara whatsapp_click (origin: price_inquiry) ao clicar em 'Consultar pelo WhatsApp'", async () => {
    const product = makeProduct({ name: "Esfera de Ágata", price: null });
    vi.mocked(api.getProductBySlug).mockResolvedValue({ product, canonicalSlug: "esfera-de-agata-a1b2c3", available: true });

    renderProductDetail(["/catalogo/esfera-de-agata-a1b2c3"]);
    await screen.findByText("Esfera de Ágata");
    vi.mocked(trackEvent).mockClear();

    fireEvent.click(screen.getByText("Consultar pelo WhatsApp"));

    expect(trackEvent).toHaveBeenCalledWith("whatsapp_click", {
      origin: "price_inquiry",
      page: "/catalogo/esfera-de-agata-a1b2c3",
    });
  });
});
