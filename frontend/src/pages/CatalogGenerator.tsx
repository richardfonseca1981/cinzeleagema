import { useEffect, useRef, useState } from "react";
import { api, ApiError, downloadCatalogJob } from "../lib/api";
import { useToast } from "../components/Toast";
import { ProductPicker } from "../components/catalog/ProductPicker";
import { buildCatalogJobRequest, formatCatalogBytes, staleRateWarning, type CatalogDividerChoice, type CatalogFormState } from "../lib/catalogGenerator";
import type { CatalogJobStatusResponse, CatalogLanguage, CatalogQuality } from "../types";

const POLL_INTERVAL_MS = 1500;

const fieldClass =
  "rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#C78F50] focus:ring-2 focus:ring-[#C78F50]/20";

const radioLabel = "flex items-center gap-2 text-sm text-[#1A1A1A]";

function SkippedOrWarningsList({ title, rows }: { title: string; rows: { label: string; reason: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] p-4">
      <p className="mb-2 text-sm font-semibold text-[#B45309]">
        {title} ({rows.length})
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-[#92400E]">
        {rows.map((row, i) => (
          <li key={i}>
            <strong>{row.label}</strong> — {row.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CatalogGenerator() {
  const { showToast } = useToast();

  const [scope, setScope] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [language, setLanguage] = useState<CatalogLanguage>("pt");
  const [showPrice, setShowPrice] = useState(true);
  const [showRef, setShowRef] = useState(true);
  const [dividers, setDividers] = useState<CatalogDividerChoice>("auto");
  const [includeContactPage, setIncludeContactPage] = useState(true);
  const [quality, setQuality] = useState<CatalogQuality>("standard");

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<CatalogJobStatusResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const pollTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => window.clearTimeout(pollTimer.current);
  }, []);

  function pollStatus(id: string) {
    api
      .getCatalogJob(id)
      .then((status) => {
        setJobStatus(status);
        if (status.status === "queued" || status.status === "running") {
          pollTimer.current = window.setTimeout(() => pollStatus(id), POLL_INTERVAL_MS);
        }
      })
      .catch(() => {
        // Falha de rede pontual no polling: tenta de novo no próximo ciclo
        // em vez de desistir da geração (que continua rodando no servidor).
        pollTimer.current = window.setTimeout(() => pollStatus(id), POLL_INTERVAL_MS);
      });
  }

  async function handleGenerate() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const state: CatalogFormState = { scope, selectedIds, language, showPrice, showRef, dividers, includeContactPage, quality };
      const { id } = await api.createCatalogJob(buildCatalogJobRequest(state));
      setJobId(id);
      setJobStatus(null);
      pollStatus(id);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Não foi possível iniciar a geração do catálogo");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownload() {
    if (!jobId) return;
    setDownloading(true);
    try {
      const { blob, filename } = await downloadCatalogJob(jobId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível baixar o catálogo");
    } finally {
      setDownloading(false);
    }
  }

  function handleReset() {
    window.clearTimeout(pollTimer.current);
    setJobId(null);
    setJobStatus(null);
    setSubmitError(null);
  }

  const isGenerating = jobId !== null && (jobStatus === null || jobStatus.status === "queued" || jobStatus.status === "running");
  const canSubmit = scope === "all" || selectedIds.length > 0;
  const rateWarning = jobStatus ? staleRateWarning({ rate: jobStatus.rate, rateSource: jobStatus.rateSource, rateUpdatedAt: jobStatus.rateUpdatedAt }) : null;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-[#1A1A1A]">Gerar catálogo em PDF</h1>
        <p className="text-sm text-[#64748B]">
          Monta um catálogo em PDF com as peças do site, pronto para enviar por WhatsApp ou e-mail. Só leitura — não altera peça nem foto nenhuma.
        </p>
      </div>

      <fieldset disabled={isGenerating} className="flex flex-col gap-5">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[#1A1A1A]">Escopo</h2>
          <div className="flex flex-col gap-2">
            <label className={radioLabel}>
              <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} className="accent-[#C78F50]" />
              Todas as peças ativas
            </label>
            <label className={radioLabel}>
              <input type="radio" name="scope" checked={scope === "selected"} onChange={() => setScope("selected")} className="accent-[#C78F50]" />
              Escolher peças
            </label>
          </div>
          {scope === "selected" && (
            <div className="mt-3">
              <ProductPicker selectedIds={selectedIds} onChangeSelected={setSelectedIds} />
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-[#1A1A1A]">Idioma</h2>
          <div className="flex gap-4">
            <label className={radioLabel}>
              <input type="radio" name="language" checked={language === "pt"} onChange={() => setLanguage("pt")} className="accent-[#C78F50]" />
              Português
            </label>
            <label className={radioLabel}>
              <input type="radio" name="language" checked={language === "en"} onChange={() => setLanguage("en")} className="accent-[#C78F50]" />
              English
            </label>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-[#1A1A1A]">Opções</h2>
          <div className="flex flex-col gap-2">
            <label className={radioLabel}>
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} className="accent-[#C78F50]" />
              Mostrar preço
            </label>
            <label className={radioLabel}>
              <input type="checkbox" checked={showRef} onChange={(e) => setShowRef(e.target.checked)} className="accent-[#C78F50]" />
              Mostrar Ref (SKU)
            </label>
            <label className={radioLabel}>
              <input
                type="checkbox"
                checked={includeContactPage}
                onChange={(e) => setIncludeContactPage(e.target.checked)}
                className="accent-[#C78F50]"
              />
              Página de contato no final
            </label>
            <label className="flex items-center gap-2 text-sm text-[#1A1A1A]">
              Divisores de categoria
              <select value={dividers} onChange={(e) => setDividers(e.target.value as CatalogDividerChoice)} className={fieldClass}>
                <option value="auto">Automático (a partir de 12 peças em 2+ categorias)</option>
                <option value="yes">Sempre mostrar</option>
                <option value="no">Nunca mostrar</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-[#1A1A1A]">Qualidade</h2>
          <div className="flex gap-4">
            <label className={radioLabel}>
              <input type="radio" name="quality" checked={quality === "standard"} onChange={() => setQuality("standard")} className="accent-[#C78F50]" />
              Padrão
            </label>
            <label className={radioLabel}>
              <input type="radio" name="quality" checked={quality === "light"} onChange={() => setQuality("light")} className="accent-[#C78F50]" />
              Leve (~8-10 MB, para WhatsApp/e-mail)
            </label>
          </div>
        </section>
      </fieldset>

      {submitError && (
        <div role="alert" className="mt-4 rounded-lg border border-[#EF4444] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {submitError}
        </div>
      )}

      {!jobId && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={submitting || !canSubmit}
          className="mt-5 rounded-lg bg-[#C78F50] px-5 py-2.5 text-sm font-medium text-[#010B1A] transition hover:bg-[#B37D3F] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Iniciando..." : "Gerar catálogo"}
        </button>
      )}

      {isGenerating && (
        <div className="mt-5 rounded-lg border border-[#E2E8F0] bg-white p-4">
          <p className="text-sm font-medium text-[#1A1A1A]" role="status" aria-live="polite">
            {jobStatus && jobStatus.progress.total > 0
              ? `Gerando ${jobStatus.progress.done}/${jobStatus.progress.total}…`
              : "Preparando geração…"}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F1F5F9]">
            <div
              className="h-full rounded-full bg-[#C78F50] transition-all"
              style={{
                width:
                  jobStatus && jobStatus.progress.total > 0
                    ? `${Math.round((jobStatus.progress.done / jobStatus.progress.total) * 100)}%`
                    : "8%",
              }}
            />
          </div>
        </div>
      )}

      {jobStatus?.status === "error" && (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-[#EF4444] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          <span>Falha na geração: {jobStatus.error ?? "erro desconhecido"}</span>
          <button type="button" onClick={handleReset} className="rounded-lg border border-[#EF4444] px-3 py-1 font-medium hover:bg-white">
            Tentar de novo
          </button>
        </div>
      )}

      {jobStatus?.status === "done" && (
        <div className="mt-5 flex flex-col gap-4">
          <div className="rounded-lg border border-[#22C55E] bg-[#F0FDF4] p-4">
            <p className="text-sm font-medium text-[#15803D]">
              Catálogo pronto: {jobStatus.pageCount} página{jobStatus.pageCount === 1 ? "" : "s"} ·{" "}
              {jobStatus.sizeBytes !== null ? formatCatalogBytes(jobStatus.sizeBytes) : "—"}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="rounded-lg bg-[#C78F50] px-4 py-2 text-sm font-medium text-[#010B1A] transition hover:bg-[#B37D3F] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {downloading ? "Baixando..." : "Baixar PDF"}
              </button>
              <button type="button" onClick={handleReset} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm hover:bg-[#F8FAFC]">
                Gerar outro catálogo
              </button>
            </div>
          </div>

          {rateWarning && (
            <div role="alert" className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-4 py-3 text-sm text-[#B45309]">
              {rateWarning}
            </div>
          )}

          <SkippedOrWarningsList
            title="Avisos (título ou preço provisório)"
            rows={jobStatus.warnings.map((w) => ({ label: `${w.title} (Ref: ${w.ref ?? "—"})`, reason: w.reason }))}
          />
          <SkippedOrWarningsList title="Peças puladas" rows={jobStatus.skipped.map((s) => ({ label: s.id, reason: s.reason }))} />
        </div>
      )}
    </div>
  );
}
