import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../components/Toast";
import type { CategoryTree, Product } from "../types";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getCategoryTree: vi.fn(),
      listProducts: vi.fn(),
      bulkMoveCategory: vi.fn(),
      undoBulkCategory: vi.fn(),
    },
    exportCategoryCsv: vi.fn(),
  };
});

import { api } from "../lib/api";
import { ProductCategorization } from "./ProductCategorization";

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: "id-1",
    name: null,
    slug: "slug-1",
    description: null,
    nameEn: null,
    descriptionEn: null,
    categoryId: null,
    subcategoryId: null,
    category: null,
    subcategory: null,
    price: null,
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

const tree: CategoryTree = {
  categories: [
    { id: "cat-1", name: "Pedras Brutas", slug: "pedras-brutas", position: 0, productCount: 1, subcategories: [] },
  ],
  uncategorized: { productCount: 2 },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ProductCategorization />
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(api.getCategoryTree).mockResolvedValue(tree);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProductCategorization", () => {
  it("visão padrão é 'Sem categoria' — chama listProducts com uncategorized:true, sem categoryId", async () => {
    vi.mocked(api.listProducts).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    renderPage();

    await waitFor(() => expect(api.listProducts).toHaveBeenCalled());
    expect(api.listProducts).toHaveBeenCalledWith(expect.objectContaining({ uncategorized: true }));
    const call = vi.mocked(api.listProducts).mock.calls[0]?.[0];
    expect(call?.categoryId).toBeUndefined();
  });

  it("clicar numa categoria na árvore troca o filtro da grade", async () => {
    vi.mocked(api.listProducts).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    renderPage();
    await waitFor(() => expect(screen.getByText("Pedras Brutas")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Pedras Brutas"));

    await waitFor(() => expect(api.listProducts).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "cat-1" })));
  });

  it("selecionar uma peça e mover: chama bulkMoveCategory com o destino certo e mostra toast com Desfazer", async () => {
    const product = makeProduct({ id: "p1", name: "Ametista" });
    vi.mocked(api.listProducts).mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 50 });
    vi.mocked(api.bulkMoveCategory).mockResolvedValue({ updated: 1, skipped: 0, skippedIds: [], items: [{ id: "p1", categoryId: "cat-1", subcategoryId: null }] });

    renderPage();
    const table = await screen.findByRole("table");
    await waitFor(() => expect(within(table).getByText("Ametista")).toBeInTheDocument());

    fireEvent.click(within(table).getByText("Ametista"));
    fireEvent.click(screen.getByText("Mover para..."));
    const picker = await screen.findByRole("dialog", { name: "Mover para" });
    fireEvent.click(within(picker).getByText("Pedras Brutas"));

    await waitFor(() =>
      expect(api.bulkMoveCategory).toHaveBeenCalledWith([{ id: "p1", categoryId: "cat-1", subcategoryId: null }])
    );
    expect(await screen.findByText("Desfazer")).toBeInTheDocument();
  });

  it("clicar em Desfazer chama undoBulkCategory", async () => {
    const product = makeProduct({ id: "p1", name: "Ametista" });
    vi.mocked(api.listProducts).mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 50 });
    vi.mocked(api.bulkMoveCategory).mockResolvedValue({ updated: 1, skipped: 0, skippedIds: [], items: [] });
    vi.mocked(api.undoBulkCategory).mockResolvedValue({ updated: 1, skipped: 0, skippedIds: [], items: [] });

    renderPage();
    const table = await screen.findByRole("table");
    await waitFor(() => expect(within(table).getByText("Ametista")).toBeInTheDocument());
    fireEvent.click(within(table).getByText("Ametista"));
    fireEvent.click(screen.getByText("Mover para..."));
    const picker = await screen.findByRole("dialog", { name: "Mover para" });
    fireEvent.click(within(picker).getByText("Pedras Brutas"));
    const undoButton = await screen.findByText("Desfazer");

    fireEvent.click(undoButton);

    await waitFor(() => expect(api.undoBulkCategory).toHaveBeenCalled());
  });

  it("'Selecionar as N peças deste filtro' pagina até coletar todos os ids, não só a página carregada", async () => {
    const products = Array.from({ length: 3 }, (_, i) => makeProduct({ id: `p${i}`, name: `Peça ${i}` }));
    vi.mocked(api.listProducts).mockImplementation(async (params = {}) => {
      if (params.page && params.page > 1) return { items: [], total: 3, page: params.page, pageSize: params.pageSize ?? 50 };
      return { items: products, total: 3, page: 1, pageSize: params.pageSize ?? 50 };
    });

    renderPage();
    const table = await screen.findByRole("table");
    await waitFor(() => expect(within(table).getByText("Peça 0")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Selecionar as 3 peça(s) deste filtro"));

    await waitFor(() => expect(screen.getByText("3 selecionada(s)")).toBeInTheDocument());
  });
});
