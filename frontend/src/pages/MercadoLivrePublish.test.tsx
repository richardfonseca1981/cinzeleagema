import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import "../i18n";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MercadoLivre } from "./MercadoLivre";
import { ToastProvider } from "../components/Toast";
import type { MercadoLivrePendencias, MercadoLivrePublishResponse, MercadoLivreSimulationResult, Product } from "../types";

// Fase 1B etapa 9 — telas de publicar/listar anúncio/pausar-tudo/pendências.
// Foco nos fluxos principais e nos estados de erro pedidos explicitamente —
// não tenta cobrir toda combinação de status do anúncio.
vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getMercadoLivreStatus: vi.fn(),
      listProducts: vi.fn(),
      simulateMercadoLivreListing: vi.fn(),
      publishMercadoLivreListing: vi.fn(),
      getMercadoLivreListing: vi.fn(),
      pauseMercadoLivreListing: vi.fn(),
      reactivateMercadoLivreListing: vi.fn(),
      closeMercadoLivreListing: vi.fn(),
      syncMercadoLivreListing: vi.fn(),
      retryMercadoLivreDescription: vi.fn(),
      reconcileMercadoLivreListing: vi.fn(),
      pauseAllMercadoLivreListings: vi.fn(),
      getMercadoLivrePendencias: vi.fn(),
      reprocessMercadoLivreWebhookEvent: vi.fn(),
    },
  };
});

import { api, ApiError } from "../lib/api";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/mercadolivre"]}>
      <ToastProvider>
        <MercadoLivre />
      </ToastProvider>
    </MemoryRouter>
  );
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    name: "Ametista Lapidada",
    slug: "ametista-lapidada",
    description: null,
    nameEn: null,
    descriptionEn: null,
    categoryId: null,
    subcategoryId: null,
    category: null,
    subcategory: null,
    price: "1200",
    sku: "AME-001",
    weightGrams: "850",
    sizeCm: "23",
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

function makeSimulation(overrides: Partial<MercadoLivreSimulationResult> = {}): MercadoLivreSimulationResult {
  return {
    productId: "prod-1",
    eligible: true,
    warnings: [],
    draft: {
      title: "Ametista Lapidada",
      titleTruncated: false,
      description: "Peça lapidada.",
      photos: ["https://cdn.test/a.jpg"],
      photosOmitted: 0,
      category: { id: "MLB_FIXME", breadcrumb: ["Joias", "Pedras"], verified: false },
      packageBox: { ok: true, source: "preset", preset: "M", box: { lengthCm: 35, widthCm: 28, heightCm: 20 }, packageWeightGrams: 1150 },
      packageBoxSource: "preset",
    },
    price: {
      basePrice: 1200,
      markupAmount: 240,
      listingPrice: 1440,
      commissionAmount: 180,
      fixedFeeBRL: 6,
      shippingCostBRL: 25,
      netReceived: 1229,
      estimatesUsed: { commissionPct: true, fixedFeeBRL: true, shippingCostBRL: true },
    },
    ...overrides,
  };
}

function makePendencias(overrides: Partial<MercadoLivrePendencias> = {}): MercadoLivrePendencias {
  return { pausePending: [], stuckPublishing: [], webhookErrors: [], webhookNotes: [], ...overrides };
}

async function selectAndSimulate(product: Product, simulation: MercadoLivreSimulationResult) {
  vi.mocked(api.listProducts).mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 10 });
  vi.mocked(api.simulateMercadoLivreListing).mockResolvedValue(simulation);
  vi.mocked(api.getMercadoLivreListing).mockResolvedValue({ listing: null });

  fireEvent.change(screen.getByLabelText(/buscar peça por nome ou sku/i), { target: { value: "Ametista" } });
  fireEvent.click(screen.getByRole("button", { name: /^buscar$/i }));
  fireEvent.click(await screen.findByText(product.name!));
  fireEvent.click(await screen.findByRole("button", { name: /simular anúncio/i }));
  await screen.findByText(/preço sugerido/i);
}

beforeEach(() => {
  vi.mocked(api.getMercadoLivreStatus).mockReset();
  vi.mocked(api.listProducts).mockReset();
  vi.mocked(api.simulateMercadoLivreListing).mockReset();
  vi.mocked(api.publishMercadoLivreListing).mockReset();
  vi.mocked(api.getMercadoLivreListing).mockReset();
  vi.mocked(api.pauseMercadoLivreListing).mockReset();
  vi.mocked(api.reactivateMercadoLivreListing).mockReset();
  vi.mocked(api.closeMercadoLivreListing).mockReset();
  vi.mocked(api.syncMercadoLivreListing).mockReset();
  vi.mocked(api.retryMercadoLivreDescription).mockReset();
  vi.mocked(api.reconcileMercadoLivreListing).mockReset();
  vi.mocked(api.pauseAllMercadoLivreListings).mockReset();
  vi.mocked(api.getMercadoLivrePendencias).mockReset();
  vi.mocked(api.reprocessMercadoLivreWebhookEvent).mockReset();
  vi.mocked(api.getMercadoLivrePendencias).mockResolvedValue(makePendencias());
});

afterEach(() => {
  cleanup();
});

describe("Banner de publicação desligada", () => {
  it("aparece quando publishEnabled é false", async () => {
    vi.mocked(api.getMercadoLivreStatus).mockResolvedValue({ connected: false, publishEnabled: false, listingTypeConfigured: false });
    renderPage();
    expect(await screen.findByText(/publicação real desligada/i)).toBeInTheDocument();
  });

  it("não aparece quando publishEnabled é true", async () => {
    vi.mocked(api.getMercadoLivreStatus).mockResolvedValue({ connected: false, publishEnabled: true, listingTypeConfigured: true });
    renderPage();
    await screen.findByText(/não conectado/i);
    expect(screen.queryByText(/publicação real desligada/i)).not.toBeInTheDocument();
  });
});

describe("Prévia de publicação (dry-run)", () => {
  it("mostra payload e pendências, e mantém Publicar (real) desabilitado", async () => {
    vi.mocked(api.getMercadoLivreStatus).mockResolvedValue({ connected: true, nickname: "LOJA", publishEnabled: true, listingTypeConfigured: true });
    renderPage();
    await screen.findByText(/^conectado$/i);
    await selectAndSimulate(makeProduct(), makeSimulation());

    const dryRun: MercadoLivrePublishResponse = {
      productId: "prod-1",
      mode: "dry-run",
      forcedDryRun: false,
      issues: ["category_not_verified"],
      publishable: false,
      notice: "Prévia — não publicável",
      payload: { title: "Ametista Lapidada", category_id: "MLB_FIXME", price: 1440, currency_id: "BRL", available_quantity: 1, buying_mode: "buy_it_now", listing_type_id: "gold_special", condition: "new", pictures: [{ source: "https://cdn.test/a.jpg" }] },
      preview: { mlItemId: "FAKE-1", permalink: "https://x" },
    };
    vi.mocked(api.publishMercadoLivreListing).mockResolvedValue(dryRun);

    fireEvent.click(screen.getByRole("button", { name: /prévia de publicação/i }));

    await screen.findByText(/categoria do mercado livre ainda não confirmada/i);
    expect(screen.getByText(/"category_id": "MLB_FIXME"/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publicar \(real\)/i })).toBeDisabled();
  });

  it("sem pendências habilita Publicar (real); confirma e publica com sucesso", async () => {
    vi.mocked(api.getMercadoLivreStatus).mockResolvedValue({ connected: true, nickname: "LOJA", publishEnabled: true, listingTypeConfigured: true });
    renderPage();
    await screen.findByText(/^conectado$/i);
    await selectAndSimulate(makeProduct(), makeSimulation());

    vi.mocked(api.publishMercadoLivreListing).mockResolvedValueOnce({
      productId: "prod-1",
      mode: "dry-run",
      forcedDryRun: false,
      issues: [],
      publishable: true,
      notice: null,
      payload: { title: "x", category_id: "y", price: 1440, currency_id: "BRL", available_quantity: 1, buying_mode: "buy_it_now", listing_type_id: "gold_special", condition: "new", pictures: [] },
      preview: { mlItemId: "FAKE-1", permalink: "https://x" },
    });

    fireEvent.click(screen.getByRole("button", { name: /prévia de publicação/i }));
    await screen.findByText(/sem pendências/i);

    const publishButton = screen.getByRole("button", { name: /publicar \(real\)/i });
    expect(publishButton).not.toBeDisabled();
    fireEvent.click(publishButton);

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/1\.440,00/);

    vi.mocked(api.publishMercadoLivreListing).mockResolvedValueOnce({ productId: "prod-1", mode: "real", status: "active", mlItemId: "ML-1", permalink: "https://ml/ML-1" });
    vi.mocked(api.getMercadoLivreListing).mockResolvedValue({
      listing: { id: "l1", accountId: "a1", productId: "prod-1", mlItemId: "ML-1", status: "active", permalink: "https://ml/ML-1", categoryId: "c1", lastSyncAt: null, lastError: null, createdAt: "", updatedAt: "" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^publicar$/i }));

    await waitFor(() => expect(api.publishMercadoLivreListing).toHaveBeenCalledWith("prod-1", { mode: "real", expectedPrice: 1440, confirm: true }));
    expect(await screen.findByText("Ativo")).toBeInTheDocument();
  });

  it("publicação real com descrição falhando mostra aviso com o detalhe", async () => {
    vi.mocked(api.getMercadoLivreStatus).mockResolvedValue({ connected: true, nickname: "LOJA", publishEnabled: true, listingTypeConfigured: true });
    renderPage();
    await screen.findByText(/^conectado$/i);
    await selectAndSimulate(makeProduct(), makeSimulation());

    vi.mocked(api.publishMercadoLivreListing).mockResolvedValueOnce({
      productId: "prod-1",
      mode: "dry-run",
      issues: [],
      publishable: true,
      payload: { title: "x", category_id: "y", price: 1440, currency_id: "BRL", available_quantity: 1, buying_mode: "buy_it_now", listing_type_id: "gold_special", condition: "new", pictures: [] },
      preview: { mlItemId: "FAKE-1", permalink: "https://x" },
    });
    fireEvent.click(screen.getByRole("button", { name: /prévia de publicação/i }));
    await screen.findByText(/sem pendências/i);
    fireEvent.click(screen.getByRole("button", { name: /publicar \(real\)/i }));
    const dialog = await screen.findByRole("alertdialog");

    vi.mocked(api.publishMercadoLivreListing).mockResolvedValueOnce({
      productId: "prod-1",
      mode: "real",
      status: "active",
      mlItemId: "ML-1",
      permalink: "https://ml/ML-1",
      warning: "description_failed",
      detail: "Falha ao enviar a descrição: timeout",
    });
    vi.mocked(api.getMercadoLivreListing).mockResolvedValue({
      listing: { id: "l1", accountId: "a1", productId: "prod-1", mlItemId: "ML-1", status: "active", permalink: "https://ml/ML-1", categoryId: null, lastSyncAt: null, lastError: "description_failed", createdAt: "", updatedAt: "" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^publicar$/i }));

    expect(await screen.findByText(/falha ao enviar a descrição: timeout/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /reenviar descrição/i })).toBeInTheDocument();
  });

  it("preço divergente (409) mostra a mensagem do backend", async () => {
    vi.mocked(api.getMercadoLivreStatus).mockResolvedValue({ connected: true, nickname: "LOJA", publishEnabled: true, listingTypeConfigured: true });
    renderPage();
    await screen.findByText(/^conectado$/i);
    await selectAndSimulate(makeProduct(), makeSimulation());

    vi.mocked(api.publishMercadoLivreListing).mockResolvedValueOnce({
      productId: "prod-1",
      mode: "dry-run",
      issues: [],
      publishable: true,
      payload: { title: "x", category_id: "y", price: 1440, currency_id: "BRL", available_quantity: 1, buying_mode: "buy_it_now", listing_type_id: "gold_special", condition: "new", pictures: [] },
      preview: { mlItemId: "FAKE-1", permalink: "https://x" },
    });
    fireEvent.click(screen.getByRole("button", { name: /prévia de publicação/i }));
    await screen.findByText(/sem pendências/i);
    fireEvent.click(screen.getByRole("button", { name: /publicar \(real\)/i }));
    const dialog = await screen.findByRole("alertdialog");

    vi.mocked(api.publishMercadoLivreListing).mockRejectedValueOnce(new ApiError(409, "Preço de anúncio mudou desde que a tela foi carregada"));

    fireEvent.click(within(dialog).getByRole("button", { name: /^publicar$/i }));

    expect(await screen.findByText(/preço de anúncio mudou/i)).toBeInTheDocument();
  });
});

describe("Cartão do anúncio publicado", () => {
  async function selectWithListing(status: string, extra: Partial<{ lastError: string | null }> = {}) {
    vi.mocked(api.getMercadoLivreStatus).mockResolvedValue({ connected: true, nickname: "LOJA", publishEnabled: true, listingTypeConfigured: true });
    renderPage();
    await screen.findByText(/^conectado$/i);
    vi.mocked(api.listProducts).mockResolvedValue({ items: [makeProduct()], total: 1, page: 1, pageSize: 10 });
    vi.mocked(api.simulateMercadoLivreListing).mockResolvedValue(makeSimulation());
    vi.mocked(api.getMercadoLivreListing).mockResolvedValue({
      listing: { id: "l1", accountId: "a1", productId: "prod-1", mlItemId: "ML-1", status, permalink: "https://ml/ML-1", categoryId: null, lastSyncAt: null, lastError: extra.lastError ?? null, createdAt: "", updatedAt: "" },
    });

    fireEvent.change(screen.getByLabelText(/buscar peça por nome ou sku/i), { target: { value: "Ametista" } });
    fireEvent.click(screen.getByRole("button", { name: /^buscar$/i }));
    fireEvent.click(await screen.findByText("Ametista Lapidada"));
    fireEvent.click(await screen.findByRole("button", { name: /simular anúncio/i }));
    await screen.findByText(/anúncio no mercado livre/i);
  }

  it("status active: pausa o anúncio e a lista atualiza para Reativar", async () => {
    await selectWithListing("active");
    await screen.findByRole("button", { name: /^pausar$/i });

    vi.mocked(api.pauseMercadoLivreListing).mockResolvedValue({ productId: "prod-1", action: "pause", status: "paused" });
    vi.mocked(api.getMercadoLivreListing).mockResolvedValue({
      listing: { id: "l1", accountId: "a1", productId: "prod-1", mlItemId: "ML-1", status: "paused", permalink: "https://ml/ML-1", categoryId: null, lastSyncAt: null, lastError: null, createdAt: "", updatedAt: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^pausar$/i }));

    await waitFor(() => expect(api.pauseMercadoLivreListing).toHaveBeenCalledWith("prod-1"));
    expect(await screen.findByRole("button", { name: /^reativar$/i })).toBeInTheDocument();
  });

  it("encerrar exige digitar ENCERRAR antes de habilitar a confirmação", async () => {
    await selectWithListing("active");
    fireEvent.click(await screen.findByRole("button", { name: /^encerrar$/i }));

    const dialog = await screen.findByRole("alertdialog");
    const confirmBtn = within(dialog).getByRole("button", { name: /^encerrar$/i });
    expect(confirmBtn).toBeDisabled();

    const input = within(dialog).getByRole("textbox");
    fireEvent.change(input, { target: { value: "encerrar" } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: "ENCERRAR" } });
    expect(confirmBtn).not.toBeDisabled();

    vi.mocked(api.closeMercadoLivreListing).mockResolvedValue({ productId: "prod-1", action: "close", status: "closed" });
    vi.mocked(api.getMercadoLivreListing).mockResolvedValue({
      listing: { id: "l1", accountId: "a1", productId: "prod-1", mlItemId: "ML-1", status: "closed", permalink: "https://ml/ML-1", categoryId: null, lastSyncAt: null, lastError: null, createdAt: "", updatedAt: "" },
    });

    fireEvent.click(confirmBtn);

    await waitFor(() => expect(api.closeMercadoLivreListing).toHaveBeenCalledWith("prod-1", "ENCERRAR"));
  });

  it("status publishing: mostra Reconciliar e atualiza após reconciliar", async () => {
    await selectWithListing("publishing");
    fireEvent.click(await screen.findByRole("button", { name: /^reconciliar$/i }));

    vi.mocked(api.reconcileMercadoLivreListing).mockResolvedValue({ productId: "prod-1", status: "active", reconciled: true, mlItemId: "ML-1" });
    vi.mocked(api.getMercadoLivreListing).mockResolvedValue({
      listing: { id: "l1", accountId: "a1", productId: "prod-1", mlItemId: "ML-1", status: "active", permalink: "https://ml/ML-1", categoryId: null, lastSyncAt: null, lastError: null, createdAt: "", updatedAt: "" },
    });

    await waitFor(() => expect(api.reconcileMercadoLivreListing).toHaveBeenCalledWith("prod-1"));
  });
});

describe("Pausar todos os anúncios", () => {
  it("exige digitar PAUSAR TUDO e mostra o resumo por anúncio", async () => {
    vi.mocked(api.getMercadoLivreStatus).mockResolvedValue({ connected: true, nickname: "LOJA", publishEnabled: true, listingTypeConfigured: true });
    renderPage();
    await screen.findByText(/^conectado$/i);

    fireEvent.click(await screen.findByRole("button", { name: /pausar todos os anúncios/i }));
    const dialog = await screen.findByRole("alertdialog");
    const confirmBtn = within(dialog).getByRole("button", { name: /pausar tudo/i });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "PAUSAR TUDO" } });
    expect(confirmBtn).not.toBeDisabled();

    vi.mocked(api.pauseAllMercadoLivreListings).mockResolvedValue({
      total: 2,
      succeeded: 1,
      results: [
        { productId: "p1", mlItemId: "m1", ok: true },
        { productId: "p2", mlItemId: "m2", ok: false, error: "falha simulada" },
      ],
    });

    fireEvent.click(confirmBtn);

    await waitFor(() => expect(api.pauseAllMercadoLivreListings).toHaveBeenCalledWith("PAUSAR TUDO"));
    // Aparece duas vezes (toast + painel de resumo) — getAllByText em vez de
    // getByText, que exige exatamente um match.
    expect((await screen.findAllByText(/1\/2 anúncios pausados/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/falha simulada/)).toBeInTheDocument();
  });
});

describe("Painel de Pendências", () => {
  it("lista eventos com erro e reprocessa um deles", async () => {
    vi.mocked(api.getMercadoLivreStatus).mockResolvedValue({ connected: true, nickname: "LOJA", publishEnabled: true, listingTypeConfigured: true });
    vi.mocked(api.getMercadoLivrePendencias).mockResolvedValue(
      makePendencias({
        webhookErrors: [
          { id: "evt-1", bodyHash: "h1", resource: "/orders/1", topic: "orders_v2", receivedAt: "2026-01-01T00:00:00.000Z", processedAt: "2026-01-01T00:00:01.000Z", lastError: "SKU não encontrado", note: null },
        ],
        webhookNotes: [
          { id: "evt-2", bodyHash: "h2", resource: "/orders/2", topic: "orders_v2", receivedAt: "2026-01-01T00:00:00.000Z", processedAt: "2026-01-01T00:00:01.000Z", lastError: null, note: "Pedido 2 cancelado — revisão manual necessária" },
        ],
      })
    );

    renderPage();

    expect(await screen.findByText(/sku não encontrado/i)).toBeInTheDocument();
    expect(screen.getByText(/pedido 2 cancelado/i)).toBeInTheDocument();
    expect(screen.getByText(/desfazer venda/i)).toBeInTheDocument();

    vi.mocked(api.reprocessMercadoLivreWebhookEvent).mockResolvedValue({
      ok: true,
      message: "ok",
      event: { id: "evt-1", bodyHash: "h1", resource: "/orders/1", topic: "orders_v2", receivedAt: "2026-01-01T00:00:00.000Z", processedAt: "2026-01-01T00:00:02.000Z", lastError: null, note: "Pedido 1 pago — marcado vendido" },
    });
    vi.mocked(api.getMercadoLivrePendencias).mockResolvedValueOnce(
      makePendencias({
        webhookErrors: [
          { id: "evt-1", bodyHash: "h1", resource: "/orders/1", topic: "orders_v2", receivedAt: "2026-01-01T00:00:00.000Z", processedAt: "2026-01-01T00:00:01.000Z", lastError: "SKU não encontrado", note: null },
        ],
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /^reprocessar$/i }));

    await waitFor(() => expect(api.reprocessMercadoLivreWebhookEvent).toHaveBeenCalledWith("evt-1"));
  });

  it("erro ao carregar as pendências mostra uma mensagem", async () => {
    vi.mocked(api.getMercadoLivreStatus).mockResolvedValue({ connected: false, publishEnabled: false, listingTypeConfigured: false });
    vi.mocked(api.getMercadoLivrePendencias).mockRejectedValue(new ApiError(500, "Erro interno do servidor"));

    renderPage();

    expect(await screen.findByText(/não foi possível carregar as pendências/i)).toBeInTheDocument();
  });
});
