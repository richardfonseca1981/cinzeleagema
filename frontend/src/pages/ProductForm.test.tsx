import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import "../i18n";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProductForm } from "./ProductForm";
import { ToastProvider } from "../components/Toast";
import type { Product } from "../types";

// Fase 1B etapa 10 — campos de override manual de embalagem pro Mercado
// Livre. ImageManager/IdentificationPanel são mockados: não são o foco
// deste teste e têm dependências próprias pesadas (upload, IA) que só
// adicionariam ruído aqui.
vi.mock("../components/ImageManager", () => ({
  ImageManager: () => null,
}));
vi.mock("../components/IdentificationPanel", () => ({
  IdentificationPanel: () => null,
}));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listCategories: vi.fn().mockResolvedValue([]),
      getProduct: vi.fn(),
      updateProduct: vi.fn(),
      createProduct: vi.fn(),
    },
  };
});

import { api, ApiError } from "../lib/api";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    name: "Obelisco Grande",
    slug: "obelisco-grande",
    description: null,
    nameEn: null,
    descriptionEn: null,
    categoryId: null,
    subcategoryId: null,
    category: null,
    subcategory: null,
    price: "2000",
    sku: "OBE-001",
    weightGrams: "3000",
    sizeCm: "62",
    packageLengthCm: null,
    packageWidthCm: null,
    packageHeightCm: null,
    mlPackageOverrideLengthCm: null,
    mlPackageOverrideWidthCm: null,
    mlPackageOverrideHeightCm: null,
    mlPackageOverrideWeightG: null,
    trackStock: false,
    stockQty: null,
    images: [{ id: "img-1", url: "https://cdn.test/a.jpg", key: "k/a.jpg", position: 0 }],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderForm(productId = "prod-1") {
  return render(
    <MemoryRouter initialEntries={[`/admin/produtos/${productId}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/admin/produtos/:id" element={<ProductForm />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(api.getProduct).mockReset();
  vi.mocked(api.updateProduct).mockReset();
  vi.mocked(api.createProduct).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ProductForm — embalagem manual para o Mercado Livre", () => {
  it("mostra os 4 campos vazios por padrão e carrega valores salvos ao editar", async () => {
    vi.mocked(api.getProduct).mockResolvedValue(
      makeProduct({ mlPackageOverrideLengthCm: "70", mlPackageOverrideWidthCm: "40", mlPackageOverrideHeightCm: "40", mlPackageOverrideWeightG: "3300" })
    );

    renderForm();

    expect(await screen.findByLabelText("Comprimento (cm)")).toHaveValue(70);
    expect(screen.getByLabelText("Largura (cm)")).toHaveValue(40);
    expect(screen.getByLabelText("Altura (cm)")).toHaveValue(40);
    expect(screen.getByLabelText("Peso do pacote (g)")).toHaveValue(3300);
  });

  it("preenchimento parcial mostra o aviso de tudo-ou-nada", async () => {
    vi.mocked(api.getProduct).mockResolvedValue(makeProduct());
    renderForm();

    const lengthInput = await screen.findByLabelText("Comprimento (cm)");
    expect(screen.queryByText(/será rejeitado ao salvar/i)).not.toBeInTheDocument();

    fireEvent.change(lengthInput, { target: { value: "70" } });
    expect(await screen.findByText(/será rejeitado ao salvar/i)).toBeInTheDocument();
  });

  it("preenchimento completo NÃO mostra o aviso, e salva os 4 valores convertidos para número", async () => {
    vi.mocked(api.getProduct).mockResolvedValue(makeProduct());
    vi.mocked(api.updateProduct).mockResolvedValue(makeProduct());
    renderForm();

    fireEvent.change(await screen.findByLabelText("Comprimento (cm)"), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText("Largura (cm)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Altura (cm)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Peso do pacote (g)"), { target: { value: "3300" } });

    expect(screen.queryByText(/será rejeitado ao salvar/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));

    await waitFor(() =>
      expect(api.updateProduct).toHaveBeenCalledWith(
        "prod-1",
        expect.objectContaining({
          mlPackageOverrideLengthCm: 70,
          mlPackageOverrideWidthCm: 40,
          mlPackageOverrideHeightCm: 40,
          mlPackageOverrideWeightG: 3300,
        })
      )
    );
  });

  it("limpar os 4 campos de volta (null) também salva sem aviso", async () => {
    vi.mocked(api.getProduct).mockResolvedValue(
      makeProduct({ mlPackageOverrideLengthCm: "70", mlPackageOverrideWidthCm: "40", mlPackageOverrideHeightCm: "40", mlPackageOverrideWeightG: "3300" })
    );
    vi.mocked(api.updateProduct).mockResolvedValue(makeProduct());
    renderForm();

    await screen.findByLabelText("Comprimento (cm)");
    fireEvent.change(screen.getByLabelText("Comprimento (cm)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Largura (cm)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Altura (cm)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Peso do pacote (g)"), { target: { value: "" } });

    expect(screen.queryByText(/será rejeitado ao salvar/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));

    await waitFor(() =>
      expect(api.updateProduct).toHaveBeenCalledWith(
        "prod-1",
        expect.objectContaining({
          mlPackageOverrideLengthCm: null,
          mlPackageOverrideWidthCm: null,
          mlPackageOverrideHeightCm: null,
          mlPackageOverrideWeightG: null,
        })
      )
    );
  });

  it("erro 400 do backend (tudo-ou-nada rejeitado no servidor) mostra a mensagem num toast", async () => {
    vi.mocked(api.getProduct).mockResolvedValue(makeProduct());
    vi.mocked(api.updateProduct).mockRejectedValue(new ApiError(400, "Embalagem manual para o Mercado Livre: preencha os 4 campos juntos, ou nenhum deles."));
    renderForm();

    fireEvent.change(await screen.findByLabelText("Comprimento (cm)"), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText("Largura (cm)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Altura (cm)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Peso do pacote (g)"), { target: { value: "3300" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));

    expect(await screen.findByText(/preencha os 4 campos juntos, ou nenhum deles/i)).toBeInTheDocument();
  });
});
