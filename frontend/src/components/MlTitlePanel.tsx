import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../lib/api";
import type { MercadoLivreTitleSuggestions } from "../types";
import { useToast } from "./Toast";

// Mesmo limite do backend (ML_TITLE_MAX_CHARS, listingValidator.ts) — só
// pra feedback imediato no campo; a validação que de fato impede salvar
// é sempre a do backend (zod, schemas/product.schema.ts).
const MAX_CHARS = 60;

const inputClass =
  "mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none transition focus:border-[#C78F50] focus:ring-2 focus:ring-[#C78F50]/20";
const labelClass = "block text-sm font-medium text-[#1A1A1A]";

interface MlTitlePanelProps {
  productId: string;
  mlTitle: string | null;
  mlTitleApprovedAt: string | null;
  onChange: (next: { mlTitle: string | null; mlTitleApprovedAt: string | null }) => void;
}

// Etapa "título aprovado" (Mercado Livre) — painel autocontido, salva por
// rotas PRÓPRIAS (PATCH /api/products/:id pro texto, POST .../ml-title/
// approve|unapprove pra aprovação), nunca pelo submit principal do
// formulário — mesmo padrão de independência do IdentificationPanel.tsx.
export function MlTitlePanel({ productId, mlTitle, mlTitleApprovedAt, onChange }: MlTitlePanelProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [draft, setDraft] = useState(mlTitle ?? "");
  const [suggestions, setSuggestions] = useState<MercadoLivreTitleSuggestions | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    setDraft(mlTitle ?? "");
  }, [mlTitle]);

  useEffect(() => {
    let cancelled = false;
    setLoadingSuggestions(true);
    api
      .getMlTitleSuggestions(productId)
      .then((result) => {
        if (!cancelled) setSuggestions(result);
      })
      .catch(() => {
        if (!cancelled) showToast("error", t("mercadoLivreAdmin.mlTitle.errors.loadSuggestions"));
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const isApproved = Boolean(mlTitleApprovedAt);
  const isDirty = draft.trim() !== (mlTitle ?? "").trim();

  async function handleSave() {
    setSaving(true);
    try {
      const trimmed = draft.trim();
      const updated = await api.updateProduct(productId, { mlTitle: trimmed === "" ? null : trimmed });
      onChange({ mlTitle: updated.mlTitle ?? null, mlTitleApprovedAt: updated.mlTitleApprovedAt ?? null });
      showToast("success", t("mercadoLivreAdmin.mlTitle.toasts.saved"));
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.mlTitle.errors.save"));
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const updated = await api.approveMlTitle(productId);
      onChange({ mlTitle: updated.mlTitle ?? null, mlTitleApprovedAt: updated.mlTitleApprovedAt ?? null });
      setDraft(updated.mlTitle ?? "");
      showToast("success", t("mercadoLivreAdmin.mlTitle.toasts.approved"));
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.mlTitle.errors.approve"));
    } finally {
      setApproving(false);
    }
  }

  async function handleUnapprove() {
    setApproving(true);
    try {
      const updated = await api.unapproveMlTitle(productId);
      onChange({ mlTitle: updated.mlTitle ?? null, mlTitleApprovedAt: updated.mlTitleApprovedAt ?? null });
      showToast("success", t("mercadoLivreAdmin.mlTitle.toasts.unapproved"));
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : t("mercadoLivreAdmin.mlTitle.errors.unapprove"));
    } finally {
      setApproving(false);
    }
  }

  function useSuggestion(text: string | null) {
    if (!text) return;
    setDraft(text);
  }

  return (
    <section className="rounded-lg border border-[#E2E8F0] bg-white p-6">
      <h3 className="text-sm font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.mlTitle.title")}</h3>
      <p className="mt-1 text-xs text-[#64748B]">{t("mercadoLivreAdmin.mlTitle.hint")}</p>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="ml-title-input" className={labelClass}>
            {t("mercadoLivreAdmin.mlTitle.fieldLabel")}
          </label>
          <span
            className="rounded px-2 py-0.5 text-xs font-semibold"
            style={
              isApproved
                ? { backgroundColor: "#DCFCE7", color: "#166534", border: "1px solid #86EFAC" }
                : { backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }
            }
          >
            {isApproved ? t("mercadoLivreAdmin.mlTitle.approvedBadge") : t("mercadoLivreAdmin.mlTitle.notApprovedBadge")}
          </span>
        </div>
        <input
          id="ml-title-input"
          type="text"
          maxLength={MAX_CHARS}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-[#64748B]">
          {t("mercadoLivreAdmin.mlTitle.charCount", { count: draft.length, max: MAX_CHARS })}
        </p>
      </div>

      {!loadingSuggestions && suggestions && (
        <div className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          <p className="text-xs font-semibold text-[#1A1A1A]">{t("mercadoLivreAdmin.mlTitle.suggestionsTitle")}</p>
          {suggestions.titleA && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-sm text-[#1A1A1A]">
                {t("mercadoLivreAdmin.mlTitle.suggestionA")}: {suggestions.titleA}
              </span>
              <button
                type="button"
                onClick={() => useSuggestion(suggestions.titleA)}
                className="shrink-0 rounded border border-[#C78F50] px-2 py-1 text-xs text-[#C78F50] hover:bg-[#C78F50]/10"
              >
                {t("mercadoLivreAdmin.mlTitle.useSuggestion")}
              </button>
            </div>
          )}
          {suggestions.titleB ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-sm text-[#1A1A1A]">
                {t("mercadoLivreAdmin.mlTitle.suggestionB")}: {suggestions.titleB}
              </span>
              <button
                type="button"
                onClick={() => useSuggestion(suggestions.titleB)}
                className="shrink-0 rounded border border-[#C78F50] px-2 py-1 text-xs text-[#C78F50] hover:bg-[#C78F50]/10"
              >
                {t("mercadoLivreAdmin.mlTitle.useSuggestion")}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-[#64748B]">{t("mercadoLivreAdmin.mlTitle.noSuggestionB")}</p>
          )}
          {suggestions.collisions.length > 0 && (
            <div className="mt-2 space-y-1">
              {suggestions.collisions.map((collision, index) => (
                <p key={index} className="text-xs text-[#B45309]">
                  {t("mercadoLivreAdmin.mlTitle.collisionWarning", { productId: collision.productId })}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving || !isDirty}
          onClick={handleSave}
          className="rounded-lg bg-[#C78F50] px-3 py-1.5 text-sm font-medium text-[#010B1A] transition hover:bg-[#B37D3F] disabled:opacity-50"
        >
          {saving ? t("mercadoLivreAdmin.mlTitle.saving") : t("mercadoLivreAdmin.mlTitle.saveButton")}
        </button>
        {isApproved ? (
          <button
            type="button"
            disabled={approving}
            onClick={handleUnapprove}
            className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm text-[#1A1A1A] transition hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            {t("mercadoLivreAdmin.mlTitle.unapproveButton")}
          </button>
        ) : (
          <button
            type="button"
            disabled={approving || isDirty || !draft.trim()}
            onClick={handleApprove}
            className="rounded-lg border border-[#16A34A] px-3 py-1.5 text-sm text-[#16A34A] transition hover:bg-[#16A34A]/10 disabled:opacity-50"
          >
            {t("mercadoLivreAdmin.mlTitle.approveButton")}
          </button>
        )}
      </div>
    </section>
  );
}
