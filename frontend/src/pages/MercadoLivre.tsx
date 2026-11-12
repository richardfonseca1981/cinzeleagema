import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../lib/api";
import { useToast } from "../components/Toast";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { MercadoLivreStatus } from "../types";

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
    </div>
  );
}
