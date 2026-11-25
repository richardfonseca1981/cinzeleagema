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
      getBulkCategoryUndoStatus: vi.fn(),
      createCategory: vi.fn(),
      deleteCategory: vi.fn(),
    },
    exportCategoryCsv: vi.fn(),
  };
});

import { api, ApiError } from "../lib/api";
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
  vi.mocked(api.getBulkCategoryUndoStatus).mockResolvedValue({ available: false, count: 0 });
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

  it("criar categoria pela árvore chama api.createCategory e recarrega a árvore", async () => {
    vi.mocked(api.listProducts).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    vi.mocked(api.createCategory).mockResolvedValue({ id: "cat-2", name: "Homedecor", slug: "homedecor", position: 1, productCount: 0, subcategories: [] });

    renderPage();
    await waitFor(() => expect(screen.getByText("+ Nova categoria")).toBeInTheDocument());

    fireEvent.click(screen.getByText("+ Nova categoria"));
    fireEvent.change(screen.getByPlaceholderText("Nova categoria"), { target: { value: "Homedecor" } });
    fireEvent.click(screen.getByLabelText("Confirmar"));

    await waitFor(() => expect(api.createCategory).toHaveBeenCalledWith("Homedecor"));
    // Recarrega a árvore depois de criar (2ª chamada: a do mount + a do reload).
    await waitFor(() => expect(api.getCategoryTree).toHaveBeenCalledTimes(2));
  });

  it("apagar categoria com peças (409) abre confirmação; confirmar chama deleteCategory(id, true)", async () => {
    vi.mocked(api.listProducts).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    vi.mocked(api.deleteCategory).mockImplementation(async (_id, moveAffected) => {
      if (!moveAffected) throw new ApiError(409, "Esta categoria tem 4 peça(s).", { productCount: 4 });
      return { deleted: true, productsMoved: 4 };
    });

    renderPage();
    await waitFor(() => expect(screen.getByText("Pedras Brutas")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Apagar Pedras Brutas"));

    expect(await screen.findByText(/4 peça\(s\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Apagar mesmo assim"));

    await waitFor(() => expect(api.deleteCategory).toHaveBeenCalledWith("cat-1", true));
  });

  describe("botão persistente 'Desfazer última movimentação'", () => {
    it("não aparece quando não há ação desfazível", async () => {
      vi.mocked(api.listProducts).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
      renderPage();

      await waitFor(() => expect(api.getBulkCategoryUndoStatus).toHaveBeenCalled());
      expect(screen.queryByText(/^Desfazer:/)).not.toBeInTheDocument();
    });

    it("aparece com a contagem de peças quando há uma movimentação desfazível", async () => {
      vi.mocked(api.listProducts).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
      vi.mocked(api.getBulkCategoryUndoStatus).mockResolvedValue({ available: true, count: 7 });
      renderPage();

      expect(await screen.findByText("Desfazer: 7 peça(s)")).toBeInTheDocument();
    });

    it("até 20 peças, clicar desfaz direto (sem pedir confirmação)", async () => {
      vi.mocked(api.listProducts).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
      vi.mocked(api.getBulkCategoryUndoStatus).mockResolvedValue({ available: true, count: 20 });
      vi.mocked(api.undoBulkCategory).mockResolvedValue({ updated: 20, skipped: 0, skippedIds: [], items: [] });
      renderPage();

      fireEvent.click(await screen.findByText("Desfazer: 20 peça(s)"));

      await waitFor(() => expect(api.undoBulkCategory).toHaveBeenCalled());
      expect(screen.queryByText("Desfazer última movimentação")).not.toBeInTheDocument();
    });

    it("acima de 20 peças, clicar pede confirmação antes de desfazer", async () => {
      vi.mocked(api.listProducts).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
      vi.mocked(api.getBulkCategoryUndoStatus).mockResolvedValue({ available: true, count: 200 });
      vi.mocked(api.undoBulkCategory).mockResolvedValue({ updated: 200, skipped: 0, skippedIds: [], items: [] });
      renderPage();

      fireEvent.click(await screen.findByText("Desfazer: 200 peça(s)"));

      expect(await screen.findByText("Desfazer última movimentação")).toBeInTheDocument();
      expect(api.undoBulkCategory).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText("Desfazer mesmo assim"));

      await waitFor(() => expect(api.undoBulkCategory).toHaveBeenCalled());
    });

    it("cancelar a confirmação não desfaz nada", async () => {
      vi.mocked(api.listProducts).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
      vi.mocked(api.getBulkCategoryUndoStatus).mockResolvedValue({ available: true, count: 200 });
      renderPage();

      fireEvent.click(await screen.findByText("Desfazer: 200 peça(s)"));
      fireEvent.click(await screen.findByText("Cancelar"));

      expect(api.undoBulkCategory).not.toHaveBeenCalled();
      expect(screen.getByText("Desfazer: 200 peça(s)")).toBeInTheDocument();
    });

    it("depois de desfazer, o botão some (o status é reconsultado)", async () => {
      vi.mocked(api.listProducts).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
      vi.mocked(api.getBulkCategoryUndoStatus)
        .mockResolvedValueOnce({ available: true, count: 5 })
        .mockResolvedValue({ available: false, count: 0 });
      vi.mocked(api.undoBulkCategory).mockResolvedValue({ updated: 5, skipped: 0, skippedIds: [], items: [] });
      renderPage();

      fireEvent.click(await screen.findByText("Desfazer: 5 peça(s)"));

      await waitFor(() => expect(screen.queryByText(/^Desfazer:/)).not.toBeInTheDocument());
    });
  });
});
