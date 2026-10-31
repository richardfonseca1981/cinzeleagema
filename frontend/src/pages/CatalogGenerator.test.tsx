import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CatalogGenerator } from "./CatalogGenerator";
import { ToastProvider } from "../components/Toast";
import type { CatalogJobStatusResponse, Product } from "../types";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getCatalogOptions: vi.fn().mockResolvedValue({ categories: [] }),
      listProducts: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
      createCatalogJob: vi.fn(),
      getCatalogJob: vi.fn(),
    },
    downloadCatalogJob: vi.fn(),
  };
});

import { api, ApiError, downloadCatalogJob } from "../lib/api";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/catalogo"]}>
      <ToastProvider>
        <CatalogGenerator />
      </ToastProvider>
    </MemoryRouter>
  );
}

function makeProduct(overrides: Partial<Product> & { id: string }): Product {
  return {
    name: null,
    slug: `slug-${overrides.id}`,
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

function doneStatus(overrides: Partial<CatalogJobStatusResponse> = {}): CatalogJobStatusResponse {
  return {
    id: "job-1",
    status: "done",
    progress: { done: 2, total: 2 },
    pageCount: 4,
    sizeBytes: 2 * 1024 * 1024,
    skipped: [],
    warnings: [],
    rate: null,
    rateSource: null,
    rateUpdatedAt: null,
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(api.createCatalogJob).mockReset();
  vi.mocked(api.getCatalogJob).mockReset();
  vi.mocked(api.getCatalogOptions).mockReset().mockResolvedValue({ categories: [] });
  vi.mocked(api.listProducts).mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
  vi.mocked(downloadCatalogJob).mockReset();
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock-url"), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("CatalogGenerator", () => {
  it("escopo padrão ('Todas as peças ativas') não manda productIds ao gerar", async () => {
    vi.mocked(api.createCatalogJob).mockResolvedValue({ id: "job-1" });
    vi.mocked(api.getCatalogJob).mockResolvedValue(doneStatus());

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Gerar catálogo" }));

    await waitFor(() => expect(api.createCatalogJob).toHaveBeenCalledTimes(1));
    expect(api.createCatalogJob).toHaveBeenCalledWith(expect.objectContaining({ productIds: undefined, language: "pt" }));
  });

  it("escolher peças: seleciona uma peça na lista e envia só o id dela", async () => {
    vi.mocked(api.listProducts).mockResolvedValue({
      items: [makeProduct({ id: "p1", name: "Esmeralda", sku: "E-1" }), makeProduct({ id: "p2", name: "Ametista", sku: "A-1" })],
      total: 2,
      page: 1,
      pageSize: 100,
    });
    vi.mocked(api.createCatalogJob).mockResolvedValue({ id: "job-1" });
    vi.mocked(api.getCatalogJob).mockResolvedValue(doneStatus());

    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Escolher peças" }));

    const picker = await screen.findByText("Esmeralda");
    fireEvent.click(within(picker.closest("li")!).getByRole("checkbox"));

    expect(screen.getByText("1 peça selecionada")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gerar catálogo" }));
    await waitFor(() => expect(api.createCatalogJob).toHaveBeenCalledTimes(1));
    expect(api.createCatalogJob).toHaveBeenCalledWith(expect.objectContaining({ productIds: ["p1"] }));
  });

  it("escolher peças sem nenhuma selecionada desabilita o botão Gerar", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Escolher peças" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar catálogo" })).toBeDisabled());
  });

  it("mostra progresso enquanto a geração está rodando, depois o resultado ao terminar", async () => {
    vi.mocked(api.createCatalogJob).mockResolvedValue({ id: "job-1" });
    vi.mocked(api.getCatalogJob)
      .mockResolvedValueOnce({ ...doneStatus(), status: "running", progress: { done: 3, total: 10 } })
      .mockResolvedValue(doneStatus({ progress: { done: 10, total: 10 }, pageCount: 12, sizeBytes: 3 * 1024 * 1024 }));

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Gerar catálogo" }));

    await screen.findByText("Gerando 3/10…");

    await waitFor(() => expect(screen.getByText(/Catálogo pronto/)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/12 páginas/)).toBeInTheDocument();
    expect(screen.getByText(/3\.00 MB/)).toBeInTheDocument();
  });

  it("exibe os avisos (título/preço provisório) quando a geração termina", async () => {
    vi.mocked(api.createCatalogJob).mockResolvedValue({ id: "job-1" });
    vi.mocked(api.getCatalogJob).mockResolvedValue(
      doneStatus({
        warnings: [
          { id: "w1", ref: "110", title: "Pedra 4875 - Peso", reason: "Nome provisório (padrão de importação em lote)" },
          { id: "w2", ref: "108", title: "Pedra 4871 - Peso", reason: "Preço provisório (≤ R$ 1,00)" },
        ],
      })
    );

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Gerar catálogo" }));

    await screen.findByText(/Avisos \(título ou preço provisório\) \(2\)/);
    expect(screen.getByText(/Pedra 4875 - Peso \(Ref: 110\)/)).toBeInTheDocument();
    expect(screen.getByText(/Nome provisório/)).toBeInTheDocument();
  });

  it("avisa cotação desatualizada quando rateSource não é 'live'", async () => {
    vi.mocked(api.createCatalogJob).mockResolvedValue({ id: "job-1" });
    vi.mocked(api.getCatalogJob).mockResolvedValue(
      doneStatus({ rate: 5.3, rateSource: "stale", rateUpdatedAt: "2026-10-20T14:32:00.000Z" })
    );

    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "Gerar catálogo" }));

    await screen.findByText(/Cotação do dólar desatualizada/);
  });

  it("baixa o PDF ao clicar em Baixar PDF", async () => {
    vi.mocked(api.createCatalogJob).mockResolvedValue({ id: "job-1" });
    vi.mocked(api.getCatalogJob).mockResolvedValue(doneStatus());
    vi.mocked(downloadCatalogJob).mockResolvedValue({ blob: new Blob(["pdf"]), filename: "catalogo-cinzel-pt-2026-10-31.pdf" });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Gerar catálogo" }));

    const downloadButton = await screen.findByRole("button", { name: "Baixar PDF" });
    fireEvent.click(downloadButton);

    await waitFor(() => expect(downloadCatalogJob).toHaveBeenCalledWith("job-1"));
  });

  it("mostra a mensagem do backend quando já existe uma geração em andamento (409)", async () => {
    vi.mocked(api.createCatalogJob).mockRejectedValue(
      new ApiError(409, "Já existe uma geração de catálogo em andamento. Aguarde terminar antes de iniciar outra.")
    );

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Gerar catálogo" }));

    await screen.findByText(/Já existe uma geração de catálogo em andamento/);
  });

  it("mostra erro e permite tentar de novo quando a geração falha", async () => {
    vi.mocked(api.createCatalogJob).mockResolvedValue({ id: "job-1" });
    vi.mocked(api.getCatalogJob).mockResolvedValue({ ...doneStatus(), status: "error", pageCount: null, sizeBytes: null, error: "Falha ao buscar fotos" });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Gerar catálogo" }));

    await screen.findByText(/Falha na geração: Falha ao buscar fotos/);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(screen.getByRole("button", { name: "Gerar catálogo" })).toBeInTheDocument();
  });
});
