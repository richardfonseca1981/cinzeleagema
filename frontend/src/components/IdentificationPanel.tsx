import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { CONFIDENCE_COLORS, CONFIDENCE_LABELS, IDENTIFICATION_DISCLAIMER, TREATMENT_LABELS } from "../lib/identification";
import type { IdentificationProposal, ProductIdentification } from "../types";
import { useToast } from "./Toast";
import { ConfirmDialog } from "./ConfirmDialog";

const EMPTY_IDENTIFICATION: ProductIdentification = {
  identificationPt: null,
  identificationEn: null,
  confidence: null,
  treatment: null,
  note: null,
};

const inputClass =
  "mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none transition focus:border-[#C78F50] focus:ring-2 focus:ring-[#C78F50]/20";
const labelClass = "block text-sm font-medium text-[#1A1A1A]";

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-[#010B1A] ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function ConfidenceBadge({ confidence }: { confidence: IdentificationProposal["confidence"] }) {
  const colors = CONFIDENCE_COLORS[confidence];
  return (
    <span
      className="rounded px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
    >
      Confiança: {CONFIDENCE_LABELS[confidence]}
    </span>
  );
}

interface IdentificationPanelProps {
  productId: string;
  productName: string;
  hasPhotos: boolean;
}

export function IdentificationPanel({ productId, productName, hasPhotos }: IdentificationPanelProps) {
  const { showToast } = useToast();
  const [saved, setSaved] = useState<ProductIdentification>(EMPTY_IDENTIFICATION);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proposal, setProposal] = useState<IdentificationProposal | null>(null);
  const [draftPt, setDraftPt] = useState("");
  const [draftEn, setDraftEn] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingSaved(true);
    api
      .getProductIdentification(productId)
      .then((result) => {
        if (!cancelled) setSaved(result);
      })
      .catch(() => {
        if (!cancelled) showToast("error", "Não foi possível carregar a identificação salva desta peça.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSaved(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function discardProposal() {
    setProposal(null);
    setDraftPt("");
    setDraftEn("");
    setDraftNote("");
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await api.generateProductIdentification(productId);
      setProposal(result);
      setDraftPt(result.identificationPt);
      setDraftEn(result.identificationEn);
      setDraftNote(result.note ?? "");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível gerar a identificação agora.");
    } finally {
      setGenerating(false);
    }
  }

  async function doSave() {
    if (!proposal) return;
    setSaving(true);
    try {
      const data: ProductIdentification = {
        identificationPt: draftPt.trim(),
        identificationEn: draftEn.trim(),
        confidence: proposal.confidence,
        treatment: proposal.treatment,
        note: draftNote.trim() || null,
      };
      const result = await api.saveProductIdentification(productId, data);
      setSaved(result);
      discardProposal();
      setShowReplaceConfirm(false);
      showToast("success", "Identificação salva com sucesso");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível salvar a identificação.");
    } finally {
      setSaving(false);
    }
  }

  function handleUseProposal() {
    if (hasSavedIdentification(saved)) {
      setShowReplaceConfirm(true);
      return;
    }
    void doSave();
  }

  return (
    <section className="rounded-lg border border-[#E2E8F0] bg-white p-6">
      <h2 className="mb-1 text-sm font-semibold text-[#1A1A1A]">Identificação para o catálogo</h2>
      <p className="mb-4 text-xs text-[#64748B]">Nome da peça (contexto): {productName || "(sem nome)"}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Identificação (PT)</label>
          <input readOnly value={saved.identificationPt ?? ""} placeholder="Ainda não gerada" className={`${inputClass} bg-[#F8FAFC]`} />
        </div>
        <div>
          <label className={labelClass}>Identificação (EN)</label>
          <input readOnly value={saved.identificationEn ?? ""} placeholder="Not generated yet" className={`${inputClass} bg-[#F8FAFC]`} />
        </div>
      </div>

      {saved.note && (
        <p className="mt-2 rounded border border-[#E2E8F0] bg-[#F8FAFC] p-2 text-xs text-[#64748B]">
          <strong className="text-[#1A1A1A]">Ressalva interna:</strong> {saved.note}
        </p>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!hasPhotos || generating || loadingSaved}
          title={!hasPhotos ? "Adicione ao menos uma foto" : undefined}
          className="flex items-center gap-2 rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-medium text-[#010B1A] transition hover:bg-[#B37D3F] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating && <Spinner />}
          {generating ? "Gerando identificação..." : "Gerar identificação com IA"}
        </button>
        {!hasPhotos && <p className="mt-1 text-xs text-[#B45309]">Adicione ao menos uma foto para gerar a identificação.</p>}
      </div>

      {proposal && (
        <div className="mt-4 space-y-3 rounded-lg border border-[#C78F50]/40 bg-[#FFFBEB]/40 p-4">
          <p className="rounded border border-[#5F84BA]/40 bg-[#F1F5F9] px-2 py-1.5 text-xs text-[#1A1A1A]">
            {IDENTIFICATION_DISCLAIMER}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Identificação (PT)</label>
              <input value={draftPt} onChange={(e) => setDraftPt(e.target.value)} disabled={saving} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Identificação (EN)</label>
              <input value={draftEn} onChange={(e) => setDraftEn(e.target.value)} disabled={saving} className={inputClass} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceBadge confidence={proposal.confidence} />
            <span className="rounded border border-[#E2E8F0] px-2 py-0.5 text-xs text-[#1A1A1A]">
              Tratamento: {TREATMENT_LABELS[proposal.treatment]}
            </span>
          </div>

          <div>
            <label className={labelClass}>Ressalva interna (não pública)</label>
            <textarea
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              disabled={saving}
              rows={2}
              className={`${inputClass} text-sm`}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving || !draftPt.trim() || !draftEn.trim()}
              onClick={handleUseProposal}
              className="flex-1 rounded-lg bg-[#22C55E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Salvando..." : "Usar esta proposta"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={discardProposal}
              className="flex-1 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B] hover:bg-white disabled:opacity-40"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showReplaceConfirm}
        title="Substituir identificação?"
        message="Já existe uma identificação. Substituir?"
        confirmLabel="Substituir"
        onConfirm={() => void doSave()}
        onCancel={() => setShowReplaceConfirm(false)}
      />
    </section>
  );
}

export { EMPTY_IDENTIFICATION, hasSavedIdentification };

function hasSavedIdentification(identification: ProductIdentification): boolean {
  return Boolean(identification.identificationPt || identification.identificationEn);
}
