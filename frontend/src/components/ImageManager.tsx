import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api, previewPhotoTreatmentRaw, uploadImageToR2 } from "../lib/api";
import {
  addNewEntry,
  commitImageChanges,
  entriesFromImages,
  hasPendingChanges,
  moveEntry,
  removeEntryAt,
  updateExistingImage,
  withNewEntryTreatment,
  withNewEntryUndo,
  type ImageEntry,
  type NewEntry,
} from "../lib/imageStaging";
import {
  ACCEPTED_PHOTO_TYPES,
  PHOTO_ASPECT_CSS,
  PHOTO_GUIDANCE,
  photoFileError,
  photoFormatWarnings,
} from "../lib/photoFormat";
import { ProductImage as SitePhoto } from "./ProductImage";
import {
  classifyPreviewResult,
  colorEnhanceMeta,
  requiresForteConfirmation,
  shortcutRequest,
  type TreatmentShortcut,
} from "../lib/treatmentRequest";
import type {
  ColorEnhanceLevel,
  PhotoTreatmentOperation,
  PhotoTreatmentPreviewReady,
  PhotoTreatmentRawPreviewReady,
  ProductImage,
  TreatmentPreviewRequest,
} from "../types";
import { useToast } from "./Toast";

export interface ImageManagerHandle {
  /** Processa as mudanças de foto pendentes (upload, exclusão, reordenação). Chamado só no "Salvar produto". */
  commit: () => Promise<ProductImage[]>;
}

interface ImageManagerProps {
  productId: string;
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
}

type ToastFn = (type: "success" | "error" | "warning", message: string) => void;

function describeOperation(op: PhotoTreatmentOperation): string {
  switch (op.operation) {
    case "removeBackground":
      return "fundo removido";
    case "sharpen":
      return `nitidez ${op.intensity}`;
    case "brightness":
      return `brilho ${op.value! > 0 ? "+" : ""}${op.value}`;
    case "contrast":
      return `contraste ${op.value! > 0 ? "+" : ""}${op.value}`;
    case "rotate":
      return `girar ${op.degrees}°`;
    case "resize":
      return `redimensionar${op.width ? ` largura ${op.width}px` : ""}${op.height ? ` altura ${op.height}px` : ""}`;
    case "crop":
      return `cortar (${op.aspectRatio ?? `${op.width}x${op.height}`})`;
    case "compress":
      return `compressão qualidade ${op.quality}`;
    case "convertFormat":
      return `converter para ${op.format}`;
    case "enhance_color":
      return `realce de cor ${op.level}`;
    case "autoFit":
      return "peça enquadrada";
  }
}

const COLOR_ENHANCE_LEVEL_LABELS: Record<ColorEnhanceLevel, string> = {
  leve: "Leve",
  medio: "Médio",
  forte: "Forte",
};

function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-[#5F84BA] ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// Mede a foto (salva ou staged) e mostra avisos discretos, sem bloquear o
// envio: fora de 9:16 (tolerância de 3%) ou menor que 720×1280.
function PhotoFormatWarnings({ url }: { url: string }) {
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setWarnings([]);
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled) setWarnings(photoFormatWarnings(probe.naturalWidth, probe.naturalHeight).map((w) => w.message));
    };
    probe.src = url;
    return () => {
      cancelled = true;
      probe.onload = null;
    };
  }, [url]);

  return (
    <>
      {warnings.map((message) => (
        <p key={message} className="mt-1 rounded border border-[#F59E0B]/40 bg-[#FFFBEB] px-1.5 py-1 text-[11px] text-[#B45309]">
          {message}
        </p>
      ))}
    </>
  );
}

function revokeNewEntryUrls(entry: NewEntry) {
  URL.revokeObjectURL(entry.previewUrl);
  if (entry.previousPreviewUrl) URL.revokeObjectURL(entry.previousPreviewUrl);
}

export const ImageManager = forwardRef<ImageManagerHandle, ImageManagerProps>(function ImageManager(
  { productId, images, onChange },
  ref
) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<ImageEntry[]>(() => entriesFromImages(images));
  const [committing, setCommitting] = useState(false);
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const localIdCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ao desmontar (navegação / "Cancelar") sem ter salvo, descarta os previews
  // locais das fotos novas ainda staged — nenhuma chamada de rede ocorreu.
  useEffect(() => {
    return () => {
      entriesRef.current.forEach((entry) => {
        if (entry.kind === "new") revokeNewEntryUrls(entry);
      });
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      commit: async () => {
        if (!hasPendingChanges(entries, images, deletedIdsRef.current)) {
          return images;
        }
        setCommitting(true);
        try {
          const result = await commitImageChanges(entries, deletedIdsRef.current, {
            upload: (entry) => uploadImageToR2(productId, entry),
            deleteImage: (imageId) => api.deleteImage(productId, imageId),
            reorder: (order) => api.reorderImages(productId, order),
          });
          entries.forEach((entry) => {
            if (entry.kind === "new") revokeNewEntryUrls(entry);
          });
          deletedIdsRef.current = new Set();
          setEntries(entriesFromImages(result));
          onChange(result);
          return result;
        } finally {
          setCommitting(false);
        }
      },
    }),
    [entries, images, onChange, productId]
  );

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileError = photoFileError(file);
    if (fileError) {
      showToast("error", fileError);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const localId = `local-${Date.now()}-${localIdCounter.current++}`;
    const previewUrl = URL.createObjectURL(file);
    setEntries((prev) => addNewEntry(prev, localId, file, previewUrl));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleMove(index: number, direction: -1 | 1) {
    setEntries((prev) => moveEntry(prev, index, direction));
  }

  function handleRemove(index: number) {
    const entry = entries[index];
    if (!entry) return;

    setEntries((prev) => removeEntryAt(prev, index));
    if (entry.kind === "new") {
      revokeNewEntryUrls(entry);
    } else {
      deletedIdsRef.current.add(entry.image.id);
      showToast("success", "Foto marcada para remoção — será excluída ao salvar o produto");
    }
  }

  function handleImageUpdated(updated: ProductImage) {
    const next = updateExistingImage(entries, updated);
    setEntries(next);
    onChange(
      next.filter((entry): entry is Extract<ImageEntry, { kind: "existing" }> => entry.kind === "existing").map((entry) => entry.image)
    );
  }

  function handleStagedEntryChange(next: NewEntry) {
    setEntries((prev) => prev.map((e) => (e.kind === "new" && e.localId === next.localId ? next : e)));
  }

  function handleStagedUndo(entry: NewEntry) {
    if (!entry.previousFile || !entry.previousPreviewUrl) return;
    const discardedPreviewUrl = entry.previewUrl;
    const next = withNewEntryUndo(entry);
    handleStagedEntryChange(next);
    URL.revokeObjectURL(discardedPreviewUrl);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3">
        {entries.map((entry, index) => (
          <div
            key={entry.kind === "existing" ? entry.image.id : entry.localId}
            className="relative w-44 rounded-lg border border-[#E2E8F0] bg-white p-2 shadow-sm"
          >
            {entry.kind === "new" && (
              <span className="absolute left-3 top-3 rounded bg-[#1B3A6B] px-1.5 py-0.5 text-[10px] font-medium text-white">
                nova — salva ao confirmar
              </span>
            )}
            {/* Preview 9:16: o mesmo componente do site, para ver como a foto vai aparecer. */}
            <SitePhoto src={entry.kind === "existing" ? entry.image.url : entry.previewUrl} alt="" className="rounded" />
            <PhotoFormatWarnings url={entry.kind === "existing" ? entry.image.url : entry.previewUrl} />
            <div className="mt-1 flex items-center justify-between text-xs text-[#64748B]">
              <button
                type="button"
                disabled={index === 0 || committing}
                onClick={() => handleMove(index, -1)}
                className="disabled:opacity-30"
              >
                ↑
              </button>
              <button type="button" disabled={committing} onClick={() => handleRemove(index)} className="text-[#EF4444] disabled:opacity-30">
                remover
              </button>
              <button
                type="button"
                disabled={index === entries.length - 1 || committing}
                onClick={() => handleMove(index, 1)}
                className="disabled:opacity-30"
              >
                ↓
              </button>
            </div>
            {entry.kind === "existing" ? (
              <ImageTreatmentPanel
                target={{ kind: "existing", productId, image: entry.image, onUpdated: handleImageUpdated }}
                showToast={showToast}
              />
            ) : (
              <ImageTreatmentPanel
                target={{ kind: "staged", entry, onChange: handleStagedEntryChange, onUndo: () => handleStagedUndo(entry) }}
                showToast={showToast}
              />
            )}
          </div>
        ))}
      </div>

      {committing && (
        <p className="mb-3 flex items-center gap-2 text-sm text-[#64748B]">
          <Spinner className="h-4 w-4" /> Salvando fotos... isso pode levar alguns segundos.
        </p>
      )}

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F8FAFC]">
        <span>Adicionar foto</span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_PHOTO_TYPES}
          onChange={handleFileSelected}
          disabled={committing}
          className="hidden"
        />
      </label>
      <p className="mt-2 text-xs font-medium text-[#1B3A6B]">{PHOTO_GUIDANCE}.</p>
      <p className="mt-1 text-xs text-[#64748B]">
        As fotos só são enviadas e as exclusões só são aplicadas quando você clicar em "Salvar produto".
      </p>
    </div>
  );
});

type TreatmentTarget =
  | { kind: "existing"; productId: string; image: ProductImage; onUpdated: (image: ProductImage) => void }
  | { kind: "staged"; entry: NewEntry; onChange: (next: NewEntry) => void; onUndo: () => void };

interface ImageTreatmentPanelProps {
  target: TreatmentTarget;
  showToast: ToastFn;
}

// Painel de tratamento por IA, compartilhado entre fotos já salvas (target
// "existing", via rota com estado + R2) e fotos staged ainda não enviadas
// (target "staged", via rota stateless + File/Blob em memória). A UI
// (textarea, antes/depois, fundo quadriculado p/ transparência, confirmar/
// descartar/desfazer) é idêntica — só a forma de buscar e aplicar o preview
// muda conforme o target.
function ImageTreatmentPanel({ target, showToast }: ImageTreatmentPanelProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [colorLevel, setColorLevel] = useState<ColorEnhanceLevel>("medio");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ operations: PhotoTreatmentOperation[]; displayUrl: string } | null>(null);
  const [pendingRaw, setPendingRaw] = useState<
    PhotoTreatmentPreviewReady | PhotoTreatmentRawPreviewReady | null
  >(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  // Aviso informativo em português: nada foi alterado (ex.: "A peça já ocupa
  // bem o quadro") ou resumo do que o tratamento fez (ex.: peça enquadrada).
  const [notice, setNotice] = useState<string | null>(null);
  // Nível "forte" de enhance_color muda bastante a cor da foto — exige um
  // segundo clique em "Confirmar" antes de salvar de verdade.
  const [forteArmed, setForteArmed] = useState(false);

  const currentUrl = target.kind === "existing" ? target.image.url : target.entry.previewUrl;
  const canUndo = target.kind === "existing" ? Boolean(target.image.previousUrl) : Boolean(target.entry.previousFile);

  const isForteColorPreview = preview ? requiresForteConfirmation(preview.operations) : false;

  function resetPanel() {
    setInstruction("");
    setPreview(null);
    setPendingRaw(null);
    setSuggestion(null);
    setNotice(null);
    setError(null);
    setForteArmed(false);
  }

  // Compartilhado pelo texto livre (via Claude) e pelos atalhos ("Realçar
  // cores", "Mais nitidez", "Remover fundo" — operations prontas, sem IA).
  async function runPreview(body: TreatmentPreviewRequest) {
    setLoading(true);
    setError(null);
    setSuggestion(null);
    setNotice(null);
    setPreview(null);
    setPendingRaw(null);
    setForteArmed(false);
    try {
      const result =
        target.kind === "existing"
          ? await api.previewPhotoTreatment(target.productId, target.image.id, body)
          : await previewPhotoTreatmentRaw(target.entry.file, body);

      const outcome = classifyPreviewResult(result);
      if (outcome.kind === "unclear") {
        setSuggestion(outcome.message);
      } else if (outcome.kind === "noChange") {
        setNotice(outcome.message);
      } else if (!result.unclear && !result.noChange) {
        setNotice(outcome.notice);
        setPreview({
          operations: result.operations,
          displayUrl: "previewUrl" in result ? result.previewUrl : result.previewDataUrl,
        });
        setPendingRaw(result);
      }
    } catch {
      setError("Não foi possível processar o pedido. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!instruction.trim()) return;
    void runPreview({ instruction });
  }

  function handleShortcut(shortcut: TreatmentShortcut) {
    void runPreview(shortcutRequest(shortcut, colorLevel));
  }

  async function handleConfirm() {
    if (!preview || !pendingRaw) return;

    // Nível forte: primeiro clique só "arma" a confirmação e avisa — só
    // salva de verdade no segundo clique.
    if (isForteColorPreview && !forteArmed) {
      setForteArmed(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const colorEnhance = colorEnhanceMeta(preview.operations);
      if (target.kind === "existing") {
        const raw = pendingRaw as PhotoTreatmentPreviewReady;
        const updated = await api.confirmPhotoTreatment(
          target.productId,
          target.image.id,
          raw.previewUrl,
          raw.previewKey,
          colorEnhance
        );
        target.onUpdated(updated);
      } else {
        const raw = pendingRaw as PhotoTreatmentRawPreviewReady;
        const blob = await fetch(raw.previewDataUrl).then((r) => r.blob());
        const treatedFile = new File([blob], target.entry.file.name, { type: blob.type });
        const treatedPreviewUrl = URL.createObjectURL(blob);
        target.onChange(
          withNewEntryTreatment(target.entry, {
            file: treatedFile,
            previewUrl: treatedPreviewUrl,
            colorEnhanced: colorEnhance.colorEnhanced,
            colorEnhanceLevel: colorEnhance.colorEnhanceLevel,
          })
        );
      }
      resetPanel();
      setOpen(false);
      showToast("success", "Tratamento aplicado com sucesso");
    } catch {
      setError("Não foi possível salvar o tratamento.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDiscard() {
    if (!preview || !pendingRaw) return;
    // Foto staged: o preview nunca saiu da memória do navegador, não há nada
    // para limpar no servidor — só reseta o painel local.
    if (target.kind === "existing") {
      setLoading(true);
      setError(null);
      try {
        const raw = pendingRaw as PhotoTreatmentPreviewReady;
        await api.discardPhotoTreatment(target.productId, target.image.id, raw.previewKey);
        resetPanel();
      } catch {
        setError("Não foi possível descartar a prévia.");
      } finally {
        setLoading(false);
      }
    } else {
      resetPanel();
    }
  }

  async function handleUndo() {
    if (target.kind === "existing") {
      setLoading(true);
      setError(null);
      try {
        const updated = await api.undoPhotoTreatment(target.productId, target.image.id);
        target.onUpdated(updated);
        showToast("success", "Tratamento desfeito");
      } catch {
        showToast("error", "Não foi possível desfazer o tratamento.");
      } finally {
        setLoading(false);
      }
    } else {
      target.onUndo();
      showToast("success", "Tratamento desfeito");
    }
  }

  return (
    <div className="mt-2 border-t border-[#E2E8F0] pt-2 text-xs">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[#5F84BA] underline decoration-dotted"
        >
          {open ? "fechar" : "tratar com IA"}
        </button>
        {canUndo && (
          <button type="button" disabled={loading} onClick={handleUndo} className="text-[#64748B] underline">
            desfazer
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={colorLevel}
              onChange={(e) => setColorLevel(e.target.value as ColorEnhanceLevel)}
              disabled={loading}
              className="rounded border border-[#E2E8F0] bg-white px-1 py-1 text-[11px] outline-none focus:border-[#C78F50]"
            >
              {(Object.keys(COLOR_ENHANCE_LEVEL_LABELS) as ColorEnhanceLevel[]).map((level) => (
                <option key={level} value={level}>
                  {COLOR_ENHANCE_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleShortcut("enhance_color")}
              className="rounded border border-[#C78F50] px-2 py-1 text-[11px] font-medium text-[#C78F50] hover:bg-[#C78F50]/10 disabled:opacity-40"
            >
              Realçar cores
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleShortcut("autoFit")}
              title="Aproxima a peça e tira o espaço em volta, sem cortar a pedra"
              className="rounded border border-[#C78F50] px-2 py-1 text-[11px] font-medium text-[#C78F50] hover:bg-[#C78F50]/10 disabled:opacity-40"
            >
              Enquadrar peça
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleShortcut("sharpen")}
              className="rounded border border-[#E2E8F0] px-2 py-1 text-[11px] text-[#1A1A1A] hover:bg-[#F8FAFC] disabled:opacity-40"
            >
              Mais nitidez
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleShortcut("removeBackground")}
              className="rounded border border-[#E2E8F0] px-2 py-1 text-[11px] text-[#1A1A1A] hover:bg-[#F8FAFC] disabled:opacity-40"
            >
              Remover fundo
            </button>
          </div>

          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={loading}
            placeholder='Ex: "remove o fundo e deixa mais nítida"'
            rows={2}
            className="w-full rounded border border-[#E2E8F0] p-1 text-xs outline-none focus:border-[#C78F50]"
          />
          <button
            type="button"
            onClick={handleApply}
            disabled={loading || !instruction.trim()}
            className="flex w-full items-center justify-center gap-2 rounded bg-[#C78F50] px-2 py-1 text-[#010B1A] hover:bg-[#B37D3F] disabled:opacity-40"
          >
            {loading ? (
              <>
                <Spinner className="h-3.5 w-3.5 text-[#010B1A]" /> Processando...
              </>
            ) : (
              "Aplicar"
            )}
          </button>

          {suggestion && (
            <p className="rounded border border-[#F59E0B] bg-[#FFFBEB] p-1 text-[#B45309]">
              Pedido pouco claro: {suggestion}
            </p>
          )}
          {notice && !preview && (
            <p className="rounded border border-[#5F84BA]/40 bg-[#F1F5F9] p-1 text-[#1A1A1A]">{notice}</p>
          )}
          {error && (
            <p className="rounded border border-[#EF4444] bg-[#FEF2F2] px-1.5 py-1 text-[#B91C1C]">{error}</p>
          )}

          {preview && (
            <div className="space-y-1 rounded border border-[#E2E8F0] bg-[#F8FAFC] p-1">
              <div className="flex gap-2">
                <div>
                  <p className="text-[#64748B]">antes</p>
                  <img src={currentUrl} alt="" className="h-40 rounded object-contain" style={{ aspectRatio: PHOTO_ASPECT_CSS }} />
                </div>
                <div>
                  <p className="text-[#64748B]">depois</p>
                  <img
                    src={preview.displayUrl}
                    alt=""
                    className="h-40 rounded object-contain"
                    style={{
                      aspectRatio: PHOTO_ASPECT_CSS,
                      backgroundImage:
                        "linear-gradient(45deg, #E2E8F0 25%, transparent 25%), linear-gradient(-45deg, #E2E8F0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #E2E8F0 75%), linear-gradient(-45deg, transparent 75%, #E2E8F0 75%)",
                      backgroundSize: "10px 10px",
                      backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0px",
                    }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-[#64748B]">Aplicado: {preview.operations.map(describeOperation).join(", ")}</p>
              {notice && <p className="text-[11px] text-[#1A1A1A]">{notice}</p>}
              {isForteColorPreview && forteArmed && (
                <p className="rounded border border-[#F59E0B] bg-[#FFFBEB] p-1 text-[#B45309]">
                  Nível forte altera bastante as cores. Clique em "Confirmar" de novo para aplicar de verdade.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleConfirm}
                  className="flex-1 rounded bg-[#22C55E] px-2 py-1 text-white hover:opacity-90 disabled:opacity-40"
                >
                  {isForteColorPreview && !forteArmed ? "Confirmar (forte)" : "Confirmar"}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleDiscard}
                  className="flex-1 rounded border border-[#E2E8F0] px-2 py-1 text-[#64748B] hover:bg-white disabled:opacity-40"
                >
                  Descartar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
