import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../lib/api";
import { useToast } from "../components/Toast";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type {
  MercadoLivreListingRecord,
  MercadoLivrePauseAllResult,
  MercadoLivrePendencias as MercadoLivrePendenciasData,
  MercadoLivrePublishResponse,
  MercadoLivreReadinessIssue,
  MercadoLivreSimulationResult,
  MercadoLivreStatus,
  MercadoLivreWebhookEventRecord,
  Product,
} from "../types";

function roundBRL(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MercadoLivre() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();

  const [status, setStatus] = useState<MercadoLivreStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    document.title = "Cinzel e a Gema Admin";
  }, []);

  function loadStatus() {
    setLoading(true);
    api
      .getMercadoLivreStatus()
      .then(setStatus)
      .catch((err) => {
        showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.errors.status"));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    setConnecting(true);
    try {
      const { url } = await api.connectMercadoLivre();
      window.location.href = url;
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.errors.connect"));
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setConfirmOpen(false);
    setDisconnecting(true);
    try {
      await api.disconnectMercadoLivre();
      setStatus({ connected: false });
      showToast("success", t("mercadoLivreAdmin.toasts.disconnected"));
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.errors.disconnect"));
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.title")}</h1>
      <p className="mb-4 text-sm text-[#64748B]">{t("mercadoLivreAdmin.subtitle")}</p>

      {!loading && status && status.publishEnabled === false && (
        <div className="mb-4 max-w-2xl rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-4 py-3 text-sm text-[#B45309]">
          {t("mercadoLivreAdmin.banner.publishDisabled")}
        </div>
      )}

      <div className="max-w-md rounded-lg border border-[#E2E8F0] bg-white p-5">
        {loading && <p className="text-sm text-[#64748B]">{t("mercadoLivreAdmin.status.loading")}</p>}

        {!loading && status?.connected && (
          <div className="space-y-3">
            <span className="inline-flex rounded-full border border-[#22C55E] bg-[#F0FDF4] px-2 py-0.5 text-xs font-medium text-[#15803D]">
              {t("mercadoLivreAdmin.status.connectedTitle")}
            </span>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[#64748B]">{t("mercadoLivreAdmin.status.nickname")}</dt>
                <dd className="text-[#1A1A1A]">{status.nickname}</dd>
              </div>
              {status.expiresAt && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[#64748B]">{t("mercadoLivreAdmin.status.expiresAt")}</dt>
                  <dd className="text-[#1A1A1A]">
                    {new Date(status.expiresAt).toLocaleString(i18n.language === "en" ? "en-US" : "pt-BR")}
                  </dd>
                </div>
              )}
            </dl>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={disconnecting}
              className="w-full rounded-lg border border-[#EF4444] py-2 text-sm font-medium text-[#B91C1C] transition hover:bg-[#FEF2F2] disabled:opacity-50"
            >
              {disconnecting ? t("mercadoLivreAdmin.disconnecting") : t("mercadoLivreAdmin.disconnect")}
            </button>
          </div>
        )}

        {!loading && status && !status.connected && (
          <div className="space-y-3">
            <span className="inline-flex rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-xs font-medium text-[#64748B]">
              {t("mercadoLivreAdmin.status.disconnectedTitle")}
            </span>
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="w-full rounded-lg bg-[#C78F50] py-2 text-sm font-medium text-[#010B1A] transition hover:bg-[#B37D3F] disabled:opacity-50"
            >
              {connecting ? t("mercadoLivreAdmin.connecting") : t("mercadoLivreAdmin.connect")}
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t("mercadoLivreAdmin.disconnectConfirm.title")}
        message={t("mercadoLivreAdmin.disconnectConfirm.message")}
        confirmLabel={t("mercadoLivreAdmin.disconnectConfirm.confirm")}
        onConfirm={handleDisconnect}
        onCancel={() => setConfirmOpen(false)}
      />

      <MercadoLivrePauseAllSection connected={Boolean(status?.connected)} />

      <MercadoLivreSimulate publishEnabled={Boolean(status?.publishEnabled)} />

      <MercadoLivrePendenciasPanel />
    </div>
  );
}

// Fase 1B etapa 9 — "pausar tudo" afeta TODOS os anúncios ativos da conta de
// uma vez: nunca automático, sempre exige a confirmação reforçada
// ("PAUSAR TUDO", exigida pelo backend — ver mercadoLivre.routes.ts
// POST /listings/pause-all). Só aparece com conta conectada (sem conta não
// há nada pra pausar).
function MercadoLivrePauseAllSection({ connected }: { connected: boolean }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pausing, setPausing] = useState(false);
  const [result, setResult] = useState<MercadoLivrePauseAllResult | null>(null);

  if (!connected) return null;

  async function handleConfirm() {
    setPausing(true);
    try {
      const res = await api.pauseAllMercadoLivreListings(typed);
      setResult(res);
      setConfirmOpen(false);
      setTyped("");
      showToast(
        res.succeeded === res.total ? "success" : "error",
        t("mercadoLivreAdmin.pauseAll.resultTitle", { succeeded: res.succeeded, total: res.total })
      );
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.pauseAll.errors.pauseAll"));
    } finally {
      setPausing(false);
    }
  }

  return (
    <div className="mt-4 max-w-md">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={pausing}
        className="w-full rounded-lg border border-[#EF4444] py-2 text-sm font-medium text-[#B91C1C] transition hover:bg-[#FEF2F2] disabled:opacity-50"
      >
        {pausing ? t("mercadoLivreAdmin.pauseAll.pausing") : t("mercadoLivreAdmin.pauseAll.button")}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title={t("mercadoLivreAdmin.pauseAll.confirmTitle")}
        message={t("mercadoLivreAdmin.pauseAll.confirmMessage")}
        confirmLabel={t("mercadoLivreAdmin.pauseAll.confirmButton")}
        confirmDisabled={typed.trim() !== "PAUSAR TUDO"}
        onConfirm={handleConfirm}
        onCancel={() => {
          setConfirmOpen(false);
          setTyped("");
        }}
      >
        <label className="block text-xs text-[#64748B]">
          {t("mercadoLivreAdmin.pauseAll.typedLabel")}
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm"
          />
        </label>
      </ConfirmDialog>

      {result && (
        <div className="mt-3 rounded-lg border border-[#E2E8F0] bg-white p-3 text-sm">
          <p className="mb-2 font-medium text-[#1A1A1A]">
            {t("mercadoLivreAdmin.pauseAll.resultTitle", { succeeded: result.succeeded, total: result.total })}
          </p>
          <ul className="space-y-1">
            {result.results.map((row) => (
              <li key={row.productId} className={row.ok ? "text-[#15803D]" : "text-[#B91C1C]"}>
                {row.productId}: {row.ok ? t("mercadoLivreAdmin.pauseAll.resultOk") : `${t("mercadoLivreAdmin.pauseAll.resultError")} — ${row.error}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Simulação de anúncio (Fase 1A) — nunca chama a API do Mercado Livre, só o
// backend local (validator/builder/priceCalculator); funciona mesmo sem
// nenhuma conta conectada (ver GET /simulate/:productId, registrada ANTES
// do middleware de 503 no backend).
function MercadoLivreSimulate({ publishEnabled }: { publishEnabled: boolean }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [markupPct, setMarkupPct] = useState("");
  const [commissionPct, setCommissionPct] = useState("");
  const [fixedFeeBRL, setFixedFeeBRL] = useState("");
  const [shippingCostBRL, setShippingCostBRL] = useState("");

  const [simulating, setSimulating] = useState(false);
  const [simulation, setSimulation] = useState<MercadoLivreSimulationResult | null>(null);

  // Fase 1B etapa 9 — dry-run/publicação real + cartão do anúncio. Tudo
  // reiniciado quando o produto selecionado muda (ver handleSimulate) — uma
  // peça por vez, nunca confunde o estado de uma peça com o de outra.
  const [previewing, setPreviewing] = useState(false);
  const [dryRun, setDryRun] = useState<MercadoLivrePublishResponse | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [listing, setListing] = useState<MercadoLivreListingRecord | null>(null);
  const [listingLoading, setListingLoading] = useState(false);
  const [listingActionLoading, setListingActionLoading] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closeTyped, setCloseTyped] = useState("");

  function refreshListing(productId: string) {
    setListingLoading(true);
    api
      .getMercadoLivreListing(productId)
      .then((res) => setListing(res.listing))
      .catch(() => setListing(null))
      .finally(() => setListingLoading(false));
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    try {
      const res = await api.listProducts({ q: query, pageSize: 10 });
      setResults(res.items);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.simulate.errors.search"));
    } finally {
      setSearching(false);
    }
  }

  async function handleSimulate(product: Product) {
    setSelectedProduct(product);
    setSimulating(true);
    setSimulation(null);
    // Nova peça selecionada: zera todo o estado de publicação da peça
    // anterior — uma peça por vez, nunca mistura prévia/anúncio de peças
    // diferentes.
    setDryRun(null);
    setListing(null);
    try {
      const params: { markupPct?: number; commissionPct?: number; fixedFeeBRL?: number; shippingCostBRL?: number } = {};
      if (markupPct !== "") params.markupPct = Number(markupPct);
      if (commissionPct !== "") params.commissionPct = Number(commissionPct);
      if (fixedFeeBRL !== "") params.fixedFeeBRL = Number(fixedFeeBRL);
      if (shippingCostBRL !== "") params.shippingCostBRL = Number(shippingCostBRL);

      const result = await api.simulateMercadoLivreListing(product.id, params);
      setSimulation(result);
      refreshListing(product.id);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.simulate.errors.simulate"));
    } finally {
      setSimulating(false);
    }
  }

  async function handlePreview() {
    if (!selectedProduct || !simulation?.price) return;
    setPreviewing(true);
    try {
      const expectedPrice = roundBRL(simulation.price.listingPrice);
      const result = await api.publishMercadoLivreListing(selectedProduct.id, { mode: "dry-run", expectedPrice });
      setDryRun(result);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.publish.errors.preview"));
    } finally {
      setPreviewing(false);
    }
  }

  async function handlePublishReal() {
    if (!selectedProduct || !simulation?.price) return;
    setPublishConfirmOpen(false);
    setPublishing(true);
    try {
      const expectedPrice = roundBRL(simulation.price.listingPrice);
      const result = await api.publishMercadoLivreListing(selectedProduct.id, { mode: "real", expectedPrice, confirm: true });
      if (result.warning) {
        showToast("error", result.detail ?? t("mercadoLivreAdmin.publish.descriptionFailedWarning", { detail: result.detail ?? "" }));
      } else {
        showToast("success", t("mercadoLivreAdmin.publish.toasts.published"));
      }
      refreshListing(selectedProduct.id);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.publish.errors.publish"));
    } finally {
      setPublishing(false);
    }
  }

  // Compartilhada pelas ações do cartão do anúncio (pausar/reativar/
  // sincronizar/reenviar descrição/reconciliar) — uma de cada vez
  // (listingActionLoading desabilita a linha inteira de botões durante a
  // chamada), sempre recarrega o registro local ao final pra refletir o
  // estado real, sucesso ou erro.
  async function runListingAction(action: () => Promise<unknown>) {
    if (!selectedProduct) return;
    setListingActionLoading(true);
    try {
      const result = await action();
      const status = result && typeof result === "object" && "status" in result ? String((result as { status: unknown }).status) : "";
      showToast("success", t("mercadoLivreAdmin.listing.toasts.actionOk", { status }));
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.listing.errors.action"));
    } finally {
      setListingActionLoading(false);
      refreshListing(selectedProduct.id);
    }
  }

  function handleCloseConfirm() {
    setCloseConfirmOpen(false);
    const typed = closeTyped;
    setCloseTyped("");
    runListingAction(() => api.closeMercadoLivreListing(selectedProduct!.id, typed));
  }

  return (
    <div className="mt-8 max-w-2xl">
      <h2 className="mb-1 text-base font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.simulate.title")}</h2>
      <p className="mb-4 text-sm text-[#64748B]">{t("mercadoLivreAdmin.simulate.description")}</p>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("mercadoLivreAdmin.simulate.searchPlaceholder")}
          aria-label={t("mercadoLivreAdmin.simulate.searchLabel")}
          className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          {searching ? t("mercadoLivreAdmin.simulate.searching") : t("mercadoLivreAdmin.simulate.searchButton")}
        </button>
      </form>

      {results.length > 0 && (
        <ul className="mb-5 space-y-1">
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => handleSimulate(product)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:bg-[#F8FAFC] ${
                  selectedProduct?.id === product.id ? "border-[#C78F50] bg-[#FFFBEB]/40" : "border-[#E2E8F0]"
                }`}
              >
                <span className="font-medium text-[#1A1A1A]">{product.name ?? product.sku ?? product.id}</span>
                {product.sku && <span className="ml-2 text-[#64748B]">{product.sku}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {results.length === 0 && query && !searching && (
        <p className="mb-5 text-sm text-[#64748B]">{t("mercadoLivreAdmin.simulate.noResults")}</p>
      )}

      {selectedProduct && (
        <div className="mb-5 rounded-lg border border-[#E2E8F0] bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.simulate.paramsTitle")}</h3>
          <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs text-[#64748B]">
              {t("mercadoLivreAdmin.simulate.markupPct")}
              <input
                type="number"
                value={markupPct}
                onChange={(e) => setMarkupPct(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-[#64748B]">
              {t("mercadoLivreAdmin.simulate.commissionPct")}
              <input
                type="number"
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-[#64748B]">
              {t("mercadoLivreAdmin.simulate.fixedFeeBRL")}
              <input
                type="number"
                value={fixedFeeBRL}
                onChange={(e) => setFixedFeeBRL(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-[#64748B]">
              {t("mercadoLivreAdmin.simulate.shippingCostBRL")}
              <input
                type="number"
                value={shippingCostBRL}
                onChange={(e) => setShippingCostBRL(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <p className="mb-3 text-xs text-[#94A3B8]">{t("mercadoLivreAdmin.simulate.estimateNote")}</p>
          <button
            type="button"
            onClick={() => handleSimulate(selectedProduct)}
            disabled={simulating}
            className="rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-medium text-[#010B1A] transition hover:bg-[#B37D3F] disabled:opacity-50"
          >
            {simulating ? t("mercadoLivreAdmin.simulate.simulating") : t("mercadoLivreAdmin.simulate.simulateButton")}
          </button>
        </div>
      )}

      {simulation && !simulation.eligible && (
        <div className="rounded-lg border border-[#EF4444] bg-[#FEF2F2] p-4 text-sm text-[#B91C1C]">
          <p className="mb-2 font-semibold">{t("mercadoLivreAdmin.simulate.notEligibleTitle")}</p>
          <p className="mb-1 text-xs">{t("mercadoLivreAdmin.simulate.blockersLabel")}</p>
          <ul className="list-disc space-y-1 pl-5">
            {simulation.blockers?.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}
          </ul>
        </div>
      )}

      {simulation && simulation.eligible && simulation.draft && simulation.price && (
        <div className="space-y-4">
          {simulation.warnings.length > 0 && (
            <div className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] p-4 text-sm text-[#B45309]">
              <p className="mb-1 font-semibold">{t("mercadoLivreAdmin.simulate.warningsLabel")}</p>
              <ul className="list-disc space-y-1 pl-5">
                {simulation.warnings.map((warning) => <li key={warning.code}>{warning.message}</li>)}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.simulate.eligibleTitle")}</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-[#64748B]">
                  {t("mercadoLivreAdmin.simulate.draftTitleLabel")}
                  {simulation.draft.titleTruncated && (
                    <span className="ml-1 text-[#B45309]">{t("mercadoLivreAdmin.simulate.draftTitleTruncated")}</span>
                  )}
                </dt>
                <dd className="text-[#1A1A1A]">{simulation.draft.title}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#64748B]">{t("mercadoLivreAdmin.simulate.draftDescriptionLabel")}</dt>
                <dd className="whitespace-pre-wrap text-[#1A1A1A]">{simulation.draft.description}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#64748B]">
                  {t("mercadoLivreAdmin.simulate.draftPhotosLabel", { count: simulation.draft.photos.length })}
                </dt>
                {simulation.draft.photosOmitted > 0 && (
                  <dd className="text-xs text-[#B45309]">
                    {t("mercadoLivreAdmin.simulate.draftPhotosOmitted", { count: simulation.draft.photosOmitted })}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-xs text-[#64748B]">{t("mercadoLivreAdmin.simulate.draftCategoryLabel")}</dt>
                <dd className="text-[#1A1A1A]">
                  {simulation.draft.category.breadcrumb.join(" > ")}
                  {!simulation.draft.category.verified && (
                    <span className="ml-2 rounded-full border border-[#F59E0B] bg-[#FFFBEB] px-2 py-0.5 text-xs text-[#B45309]">
                      {t("mercadoLivreAdmin.simulate.draftCategoryUnverified")}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#64748B]">
                  {t("mercadoLivreAdmin.simulate.draftPackageLabel")}
                  {simulation.draft.packageBox.ok && simulation.draft.packageBox.source === "manual" ? (
                    <span className="ml-1 text-[#15803D]">{t("mercadoLivreAdmin.simulate.draftPackageSourceManual")}</span>
                  ) : (
                    <span className="ml-1 text-[#B45309]">{t("mercadoLivreAdmin.simulate.draftPackageEstimateTag")}</span>
                  )}
                </dt>
                {simulation.draft.packageBox.ok ? (
                  <dd className="text-[#1A1A1A]">
                    {t("mercadoLivreAdmin.simulate.draftPackageSummary", {
                      preset: simulation.draft.packageBox.preset ?? t("mercadoLivreAdmin.simulate.draftPackageSourceManualLabel"),
                      length: simulation.draft.packageBox.box.lengthCm,
                      width: simulation.draft.packageBox.box.widthCm,
                      height: simulation.draft.packageBox.box.heightCm,
                      weight: simulation.draft.packageBox.packageWeightGrams,
                    })}
                  </dd>
                ) : (
                  <dd className="text-[#B45309]">
                    {t(`mercadoLivreAdmin.simulate.draftPackageBlocked.${simulation.draft.packageBox.reason}`)}
                  </dd>
                )}
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.simulate.priceTitle")}</h3>
            <dl className="space-y-1 text-sm">
              <PriceRow label={t("mercadoLivreAdmin.simulate.priceBasePrice")} value={simulation.price.basePrice} />
              <PriceRow label={t("mercadoLivreAdmin.simulate.priceMarkupAmount")} value={simulation.price.markupAmount} />
              <PriceRow label={t("mercadoLivreAdmin.simulate.priceListingPrice")} value={simulation.price.listingPrice} strong />
              <PriceRow
                label={t("mercadoLivreAdmin.simulate.priceCommissionAmount")}
                value={-simulation.price.commissionAmount}
                estimate={simulation.price.estimatesUsed.commissionPct}
              />
              <PriceRow
                label={t("mercadoLivreAdmin.simulate.priceFixedFee")}
                value={-simulation.price.fixedFeeBRL}
                estimate={simulation.price.estimatesUsed.fixedFeeBRL}
              />
              <PriceRow
                label={t("mercadoLivreAdmin.simulate.priceShippingCost")}
                value={-simulation.price.shippingCostBRL}
                estimate={simulation.price.estimatesUsed.shippingCostBRL}
              />
              <PriceRow label={t("mercadoLivreAdmin.simulate.priceNetReceived")} value={simulation.price.netReceived} strong />
            </dl>
          </div>

          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.publish.previewTitle")}</h3>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewing || publishing}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                {previewing ? t("mercadoLivreAdmin.publish.previewing") : t("mercadoLivreAdmin.publish.previewButton")}
              </button>
              <button
                type="button"
                onClick={() => setPublishConfirmOpen(true)}
                disabled={!dryRun || dryRun.issues?.length !== 0 || !publishEnabled || previewing || publishing}
                title={!dryRun ? t("mercadoLivreAdmin.publish.needPreviewHint") : undefined}
                className="rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-medium text-[#010B1A] transition hover:bg-[#B37D3F] disabled:opacity-50"
              >
                {publishing ? t("mercadoLivreAdmin.publish.publishing") : t("mercadoLivreAdmin.publish.publishButton")}
              </button>
            </div>

            {!dryRun && <p className="text-xs text-[#94A3B8]">{t("mercadoLivreAdmin.publish.needPreviewHint")}</p>}

            {dryRun && (
              <div className="space-y-3">
                {dryRun.forcedDryRun && (
                  <p className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] p-3 text-xs text-[#B45309]">
                    {t("mercadoLivreAdmin.publish.forcedDryRunNotice")}
                  </p>
                )}
                {dryRun.issues && dryRun.issues.length > 0 ? (
                  <div className="rounded-lg border border-[#EF4444] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">
                    <p className="mb-1 font-semibold">{t("mercadoLivreAdmin.publish.issuesTitle")}</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {dryRun.issues.map((issue: MercadoLivreReadinessIssue) => (
                        <li key={issue}>{t(`mercadoLivreAdmin.publish.issues.${issue}`)}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="rounded-lg border border-[#22C55E] bg-[#F0FDF4] p-3 text-sm text-[#15803D]">
                    {t("mercadoLivreAdmin.publish.publishableYes")}
                  </p>
                )}
                {dryRun.packageBoxSource && (
                  <p className="text-xs text-[#64748B]">
                    {t("mercadoLivreAdmin.publish.packageBoxSourceLabel")}{" "}
                    <span className={dryRun.packageBoxSource === "manual" ? "font-medium text-[#15803D]" : "font-medium text-[#B45309]"}>
                      {dryRun.packageBoxSource === "manual"
                        ? t("mercadoLivreAdmin.simulate.draftPackageSourceManualLabel")
                        : t("mercadoLivreAdmin.publish.packageBoxSourcePreset")}
                    </span>
                  </p>
                )}
                {dryRun.payload && (
                  <div>
                    <p className="mb-1 text-xs text-[#64748B]">{t("mercadoLivreAdmin.publish.payloadTitle")}</p>
                    <pre className="max-h-64 overflow-auto rounded-lg bg-[#0F172A] p-3 text-xs text-[#E2E8F0]">
                      {JSON.stringify(dryRun.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {!listingLoading && listing && (
            <MercadoLivreListingCard
              listing={listing}
              actionLoading={listingActionLoading}
              onPause={() => runListingAction(() => api.pauseMercadoLivreListing(selectedProduct!.id))}
              onReactivate={() => runListingAction(() => api.reactivateMercadoLivreListing(selectedProduct!.id))}
              onClose={() => setCloseConfirmOpen(true)}
              onSync={() => runListingAction(() => api.syncMercadoLivreListing(selectedProduct!.id))}
              onRetryDescription={() => runListingAction(() => api.retryMercadoLivreDescription(selectedProduct!.id))}
              onReconcile={() => runListingAction(() => api.reconcileMercadoLivreListing(selectedProduct!.id))}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={publishConfirmOpen}
        title={t("mercadoLivreAdmin.publish.confirmTitle")}
        message={t("mercadoLivreAdmin.publish.confirmMessage", {
          title: simulation?.draft?.title ?? selectedProduct?.name ?? "",
          price: simulation?.price ? formatBRL(roundBRL(simulation.price.listingPrice)) : "",
        })}
        confirmLabel={t("mercadoLivreAdmin.publish.confirmButton")}
        onConfirm={handlePublishReal}
        onCancel={() => setPublishConfirmOpen(false)}
      />

      <ConfirmDialog
        open={closeConfirmOpen}
        title={t("mercadoLivreAdmin.listing.closeConfirmTitle")}
        message={t("mercadoLivreAdmin.listing.closeConfirmMessage")}
        confirmLabel={t("mercadoLivreAdmin.listing.closeConfirmButton")}
        confirmDisabled={closeTyped.trim() !== "ENCERRAR"}
        onConfirm={handleCloseConfirm}
        onCancel={() => {
          setCloseConfirmOpen(false);
          setCloseTyped("");
        }}
      >
        <label className="block text-xs text-[#64748B]">
          {t("mercadoLivreAdmin.listing.closeTypedLabel")}
          <input
            type="text"
            value={closeTyped}
            onChange={(e) => setCloseTyped(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm"
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}

const LISTING_STATUS_BADGE_CLASS: Record<string, string> = {
  active: "border-[#22C55E] bg-[#F0FDF4] text-[#15803D]",
  paused: "border-[#F59E0B] bg-[#FFFBEB] text-[#B45309]",
  closed: "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]",
  publishing: "border-[#F59E0B] bg-[#FFFBEB] text-[#B45309]",
  error: "border-[#EF4444] bg-[#FEF2F2] text-[#B91C1C]",
};

// Cartão do anúncio publicado (Fase 1B etapa 9) — status, permalink, último
// erro e as ações válidas pro status atual. A validação de verdade continua
// no backend (listingLifecycle.ts) — aqui só decide quais botões FAZ SENTIDO
// mostrar; clicar num botão pra uma transição inválida ainda mostra o erro
// 409 claro do backend via toast.
function MercadoLivreListingCard({
  listing,
  actionLoading,
  onPause,
  onReactivate,
  onClose,
  onSync,
  onRetryDescription,
  onReconcile,
}: {
  listing: MercadoLivreListingRecord;
  actionLoading: boolean;
  onPause: () => void;
  onReactivate: () => void;
  onClose: () => void;
  onSync: () => void;
  onRetryDescription: () => void;
  onReconcile: () => void;
}) {
  const { t } = useTranslation();

  const showPause = listing.status === "active";
  const showReactivate = listing.status === "paused";
  const showClose = listing.status === "active" || listing.status === "paused";
  const showSync = Boolean(listing.mlItemId);
  const showReconcile = listing.status === "publishing" || listing.status === "error";
  const showRetryDescription = listing.lastError === "description_failed";

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.listing.title")}</h3>
      <dl className="mb-3 space-y-1 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[#64748B]">{t("mercadoLivreAdmin.listing.statusLabel")}</dt>
          <dd>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${LISTING_STATUS_BADGE_CLASS[listing.status] ?? "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"}`}
            >
              {t(`mercadoLivreAdmin.listing.status.${listing.status}`, listing.status)}
            </span>
          </dd>
        </div>
        {listing.permalink && (
          <div className="flex justify-between gap-4">
            <dt className="text-[#64748B]">{t("mercadoLivreAdmin.listing.permalinkLabel")}</dt>
            <dd>
              <a href={listing.permalink} target="_blank" rel="noreferrer" className="text-[#5F84BA] hover:underline">
                {t("mercadoLivreAdmin.listing.permalinkLink")}
              </a>
            </dd>
          </div>
        )}
        {listing.lastError && (
          <div>
            <dt className="text-[#64748B]">{t("mercadoLivreAdmin.listing.lastErrorLabel")}</dt>
            <dd className="text-[#B91C1C]">{listing.lastError}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {showPause && (
          <button type="button" onClick={onPause} disabled={actionLoading} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#F8FAFC] disabled:opacity-50">
            {t("mercadoLivreAdmin.listing.actions.pause")}
          </button>
        )}
        {showReactivate && (
          <button type="button" onClick={onReactivate} disabled={actionLoading} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#F8FAFC] disabled:opacity-50">
            {t("mercadoLivreAdmin.listing.actions.reactivate")}
          </button>
        )}
        {showClose && (
          <button type="button" onClick={onClose} disabled={actionLoading} className="rounded-lg border border-[#EF4444] px-3 py-1.5 text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50">
            {t("mercadoLivreAdmin.listing.actions.close")}
          </button>
        )}
        {showSync && (
          <button type="button" onClick={onSync} disabled={actionLoading} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#F8FAFC] disabled:opacity-50">
            {t("mercadoLivreAdmin.listing.actions.sync")}
          </button>
        )}
        {showRetryDescription && (
          <button type="button" onClick={onRetryDescription} disabled={actionLoading} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#F8FAFC] disabled:opacity-50">
            {t("mercadoLivreAdmin.listing.actions.retryDescription")}
          </button>
        )}
        {showReconcile && (
          <button type="button" onClick={onReconcile} disabled={actionLoading} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#F8FAFC] disabled:opacity-50">
            {t("mercadoLivreAdmin.listing.actions.reconcile")}
          </button>
        )}
      </div>
    </div>
  );
}

function PriceRow({ label, value, strong, estimate }: { label: string; value: number; strong?: boolean; estimate?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold" : ""}`}>
      <dt className="text-[#64748B]">
        {label}
        {estimate && (
          <span className="ml-1 text-xs italic text-[#B45309]">({t("mercadoLivreAdmin.simulate.estimateUsedBadge")})</span>
        )}
      </dt>
      <dd className="text-[#1A1A1A]">
        R$ {value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </dd>
    </div>
  );
}

// Fase 1B etapa 9 — painel "Pendências": agrega, numa única chamada (ver
// GET /pendencias no backend), tudo que precisa de atenção manual. Sempre
// tenta carregar (funciona mesmo sem conta conectada — as listas de anúncio
// vêm vazias nesse caso, os eventos de webhook independem de conta).
function MercadoLivrePendenciasPanel() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [data, setData] = useState<MercadoLivrePendenciasData | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(false);
    api
      .getMercadoLivrePendencias()
      .then(setData)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReprocess(event: MercadoLivreWebhookEventRecord) {
    setReprocessingId(event.id);
    try {
      await api.reprocessMercadoLivreWebhookEvent(event.id);
      showToast("success", t("mercadoLivreAdmin.pendencias.toasts.reprocessOk"));
      load();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.pendencias.errors.reprocess"));
    } finally {
      setReprocessingId(null);
    }
  }

  return (
    <div className="mt-8 max-w-2xl">
      <h2 className="mb-1 text-base font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.pendencias.title")}</h2>
      <p className="mb-4 text-sm text-[#64748B]">{t("mercadoLivreAdmin.pendencias.description")}</p>

      {loading && <p className="text-sm text-[#64748B]">{t("mercadoLivreAdmin.pendencias.loading")}</p>}
      {!loading && loadError && (
        <p className="rounded-lg border border-[#EF4444] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">
          {t("mercadoLivreAdmin.pendencias.errors.load")}
        </p>
      )}

      {!loading && !loadError && data && (
        <div className="space-y-4">
          <PendenciaListingSection
            title={t("mercadoLivreAdmin.pendencias.pausePendingTitle")}
            emptyMessage={t("mercadoLivreAdmin.pendencias.pausePendingEmpty")}
            listings={data.pausePending}
          />
          <PendenciaListingSection
            title={t("mercadoLivreAdmin.pendencias.stuckPublishingTitle")}
            emptyMessage={t("mercadoLivreAdmin.pendencias.stuckPublishingEmpty")}
            listings={data.stuckPublishing}
          />

          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.pendencias.webhookErrorsTitle")}</h3>
            {data.webhookErrors.length === 0 ? (
              <p className="text-sm text-[#64748B]">{t("mercadoLivreAdmin.pendencias.webhookErrorsEmpty")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.webhookErrors.map((event) => (
                  <li key={event.id} className="flex items-start justify-between gap-3 border-b border-[#F1F5F9] pb-2 last:border-0">
                    <div>
                      <p className="text-[#1A1A1A]">
                        {event.topic ?? "?"} — {event.resource ?? "?"}
                      </p>
                      <p className="text-xs text-[#B91C1C]">{event.lastError}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleReprocess(event)}
                      disabled={reprocessingId === event.id}
                      className="shrink-0 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#F8FAFC] disabled:opacity-50"
                    >
                      {reprocessingId === event.id ? t("mercadoLivreAdmin.pendencias.reprocessing") : t("mercadoLivreAdmin.pendencias.reprocessButton")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.pendencias.webhookNotesTitle")}</h3>
            {data.webhookNotes.length === 0 ? (
              <p className="text-sm text-[#64748B]">{t("mercadoLivreAdmin.pendencias.webhookNotesEmpty")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.webhookNotes.map((event) => {
                  const isCancelled = /cancel/i.test(event.note ?? "");
                  return (
                    <li key={event.id} className="border-b border-[#F1F5F9] pb-2 last:border-0">
                      <p className="text-[#1A1A1A]">{event.note}</p>
                      {isCancelled && <p className="mt-1 text-xs text-[#B45309]">{t("mercadoLivreAdmin.pendencias.cancelledOrderHint")}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PendenciaListingSection({
  title,
  emptyMessage,
  listings,
}: {
  title: string;
  emptyMessage: string;
  listings: MercadoLivreListingRecord[];
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-[#1A1A1A]">{title}</h3>
      {listings.length === 0 ? (
        <p className="text-sm text-[#64748B]">{emptyMessage}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {listings.map((listing) => (
            <li key={listing.id} className="flex items-center justify-between gap-3">
              <Link to={`/admin/produtos/${listing.productId}`} className="text-[#5F84BA] hover:underline">
                {t("mercadoLivreAdmin.pendencias.viewProductLink")} ({listing.productId})
              </Link>
              {listing.lastError && <span className="truncate text-xs text-[#B91C1C]">{listing.lastError}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
