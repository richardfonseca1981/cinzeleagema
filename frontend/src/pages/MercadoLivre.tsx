import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../lib/api";
import { useToast } from "../components/Toast";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { MercadoLivreStatus, MercadoLivreSimulationResult, Product } from "../types";

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

      <MercadoLivreSimulate />
    </div>
  );
}

// Simulação de anúncio (Fase 1A) — nunca chama a API do Mercado Livre, só o
// backend local (validator/builder/priceCalculator); funciona mesmo sem
// nenhuma conta conectada (ver GET /simulate/:productId, registrada ANTES
// do middleware de 503 no backend).
function MercadoLivreSimulate() {
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
    try {
      const params: { markupPct?: number; commissionPct?: number; fixedFeeBRL?: number; shippingCostBRL?: number } = {};
      if (markupPct !== "") params.markupPct = Number(markupPct);
      if (commissionPct !== "") params.commissionPct = Number(commissionPct);
      if (fixedFeeBRL !== "") params.fixedFeeBRL = Number(fixedFeeBRL);
      if (shippingCostBRL !== "") params.shippingCostBRL = Number(shippingCostBRL);

      const result = await api.simulateMercadoLivreListing(product.id, params);
      setSimulation(result);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.simulate.errors.simulate"));
    } finally {
      setSimulating(false);
    }
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
        </div>
      )}
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
