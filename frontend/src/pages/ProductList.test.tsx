import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Import direto (além do vitest.setup.ts) para o tsc do build enxergar a
// extensão de tipos dos matchers (toBeDisabled etc.) — vitest.setup.ts fica
// fora de "include" do tsconfig (só "src"), então só o import local garante
// o augmentation de tipos durante `tsc` (o registro em runtime já vem do setup).
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProductList } from "./ProductList";
import { ToastProvider } from "../components/Toast";
import type { Product } from "../types";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listCategories: vi.fn().mockResolvedValue([]),
      getPhotoStats: vi.fn().mockResolvedValue({ total: 0, portrait: 0 }),
      listProducts: vi.fn(),
      activateProduct: vi.fn(),
      deactivateProduct: vi.fn(),
    },
    exportProductsXlsx: vi.fn(),
  };
});

import { api, exportProductsXlsx } from "../lib/api";

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

const fullProduct = makeProduct({
  id: "full-1",
  name: "Esmeralda Colombiana",
  sku: "ESM-001",
  price: "8500",
  weightGrams: "12.5",
  sizeCm: "2.3",
  trackStock: true,
  stockQty: 3,
  active: true,
});

const emptyProduct = makeProduct({
  id: "empty-1",
  name: null,
  sku: null,
  price: null,
  weightGrams: "0",
  sizeCm: "0",
  trackStock: false,
  stockQty: null,
  active: false,
});

function renderList() {
  return render(
    <MemoryRouter initialEntries={["/admin/produtos"]}>
      <ToastProvider>
        <ProductList />
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(api.listProducts).mockResolvedValue({
    items: [fullProduct, emptyProduct],
    total: 2,
    page: 1,
    pageSize: 20,
  });
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ProductList", () => {
  // Telas largas e o card de celular convivem no mesmo DOM (a troca é só por
  // CSS/breakpoint, que o jsdom não aplica) — por isso toda asserção de
  // conteúdo de linha fica restrita à <table>, que é onde as colunas pedidas
  // realmente existem (o card usa <dt>/<dd>, sem role de tabela).
  function getTable() {
    return screen.getByRole("table");
  }

  it("renders the columns in the requested order", async () => {
    renderList();
    const table = getTable();
    await within(table).findByText("Esmeralda Colombiana");

    const headerCells = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headerCells.slice(0, 6)).toEqual(["SKU", "Descrição", "Tamanho", "Peso", "Estoque", "Preço de venda"]);
  });

  it("shows formatted values for a complete product", async () => {
    renderList();
    const table = getTable();
    const row = (await within(table).findByText("Esmeralda Colombiana")).closest("tr")!;
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);

    expect(cells[0]).toBe("ESM-001");
    expect(cells[1]).toBe("Esmeralda Colombiana");
    expect(cells[2]).toBe("2,3cm");
    expect(cells[3]).toBe("12,5g");
    expect(cells[4]).toBe("3");
    expect(cells[5]).toContain("8.500,00");
  });

  it('shows "—" and "Consulte o valor" for missing fields', async () => {
    renderList();
    const table = getTable();
    await within(table).findByText("Esmeralda Colombiana");

    const row = within(table).getByText("(sem nome)").closest("tr")!;
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);

    expect(cells[0]).toBe("—"); // SKU ausente
    expect(cells[1]).toBe("(sem nome)");
    expect(cells[2]).toBe("—"); // tamanho 0
    expect(cells[3]).toBe("—"); // peso 0
    expect(cells[4]).toBe("Peça única");
    expect(cells[5]).toBe("Consulte o valor");
  });

  it('renders an "Exportar Excel" button that downloads the file', async () => {
    vi.mocked(exportProductsXlsx).mockResolvedValue({
      blob: new Blob(["conteudo"]),
      filename: "pecas-2026-10-15.xlsx",
    });

    renderList();
    await within(getTable()).findByText("Esmeralda Colombiana");

    const button = screen.getByRole("button", { name: "Exportar Excel" });
    fireEvent.click(button);

    await waitFor(() => expect(exportProductsXlsx).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar Excel" })).not.toBeDisabled());
  });

  it('shows an error toast when the export fails', async () => {
    vi.mocked(exportProductsXlsx).mockRejectedValue(new Error("falhou"));

    renderList();
    await within(getTable()).findByText("Esmeralda Colombiana");

    fireEvent.click(screen.getByRole("button", { name: "Exportar Excel" }));

    await screen.findByText("Não foi possível exportar os produtos");
  });
});
