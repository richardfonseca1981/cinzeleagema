import { useRef, useState } from "react";
import { api, uploadImageToR2 } from "../lib/api";
import type { PhotoTreatmentOperation, PhotoTreatmentPreviewResult, ProductImage } from "../types";
import { useToast } from "./Toast";

interface ImageManagerProps {
  productId: string;
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
}

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
  }
}

function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-[#1B3A6B] ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function ImageManager({ productId, images, onChange }: ImageManagerProps) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const image = await uploadImageToR2(productId, file);
      onChange([...images, image].sort((a, b) => a.position - b.position));
      showToast("success", "Imagem enviada com sucesso");
    } catch {
      showToast("error", "Não foi possível enviar a imagem. Verifique a configuração do R2.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const reordered = [...images];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    onChange(reordered);

    await api.reorderImages(
      productId,
      reordered.map((img) => img.id)
    );
  }

  async function handleDelete(imageId: string) {
    await api.deleteImage(productId, imageId);
    onChange(images.filter((img) => img.id !== imageId));
    showToast("success", "Imagem removida");
  }

  function handleImageUpdated(updated: ProductImage) {
    onChange(images.map((img) => (img.id === updated.id ? updated : img)));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3">
        {images.map((image, index) => (
          <div key={image.id} className="relative w-56 rounded-lg border border-[#E2E8F0] bg-white p-2 shadow-sm">
            <img src={image.url} alt="" className="h-32 w-full rounded object-cover" />
            <div className="mt-1 flex items-center justify-between text-xs text-[#64748B]">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => handleMove(index, -1)}
                className="disabled:opacity-30"
              >
                ↑
              </button>
              <button type="button" onClick={() => handleDelete(image.id)} className="text-[#EF4444]">
                remover
              </button>
              <button
                type="button"
                disabled={index === images.length - 1}
                onClick={() => handleMove(index, 1)}
                className="disabled:opacity-30"
              >
                ↓
              </button>
            </div>
            <ImageTreatmentPanel
              productId={productId}
              image={image}
              onUpdated={handleImageUpdated}
              showToast={showToast}
            />
          </div>
        ))}

        {uploading && (
          <div className="flex w-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-2">
            <div className="h-32 w-full animate-pulse rounded bg-[#E2E8F0]" />
            <div className="flex items-center gap-2 text-xs text-[#64748B]">
              <Spinner className="h-4 w-4" /> Enviando imagem...
            </div>
          </div>
        )}
      </div>

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F8FAFC]">
        {uploading && <Spinner className="h-4 w-4" />}
        <span>{uploading ? "Enviando..." : "Adicionar foto"}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelected}
          disabled={uploading}
          className="hidden"
        />
      </label>
    </div>
  );
}

interface ImageTreatmentPanelProps {
  productId: string;
  image: ProductImage;
  onUpdated: (image: ProductImage) => void;
  showToast: (type: "success" | "error" | "warning", message: string) => void;
}

function ImageTreatmentPanel({ productId, image, onUpdated, showToast }: ImageTreatmentPanelProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Extract<PhotoTreatmentPreviewResult, { unclear: false }> | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  function resetPanel() {
    setInstruction("");
    setPreview(null);
    setSuggestion(null);
    setError(null);
  }

  async function handleApply() {
    if (!instruction.trim()) return;
    setLoading(true);
    setError(null);
    setSuggestion(null);
    setPreview(null);
    try {
      const result = await api.previewPhotoTreatment(productId, image.id, instruction);
      if (result.unclear) {
        setSuggestion(result.suggestion ?? "Tente descrever o tratamento de outra forma.");
      } else {
        setPreview(result);
      }
    } catch {
      setError("Não foi possível interpretar o pedido. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await api.confirmPhotoTreatment(productId, image.id, preview.previewUrl, preview.previewKey);
      onUpdated(updated);
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
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      await api.discardPhotoTreatment(productId, image.id, preview.previewKey);
      resetPanel();
    } catch {
      setError("Não foi possível descartar a prévia.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUndo() {
    setLoading(true);
    setError(null);
    try {
      const updated = await api.undoPhotoTreatment(productId, image.id);
      onUpdated(updated);
      showToast("success", "Tratamento desfeito");
    } catch {
      showToast("error", "Não foi possível desfazer o tratamento.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 border-t border-[#E2E8F0] pt-2 text-xs">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[#1B3A6B] underline decoration-dotted"
        >
          {open ? "fechar" : "tratar com IA"}
        </button>
        {image.previousUrl && (
          <button type="button" disabled={loading} onClick={handleUndo} className="text-[#64748B] underline">
            desfazer
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={loading}
            placeholder='Ex: "remove o fundo e deixa mais nítida"'
            rows={2}
            className="w-full rounded border border-[#E2E8F0] p-1 text-xs outline-none focus:border-[#1B3A6B]"
          />
          <button
            type="button"
            onClick={handleApply}
            disabled={loading || !instruction.trim()}
            className="flex w-full items-center justify-center gap-2 rounded bg-[#1B3A6B] px-2 py-1 text-white hover:bg-[#152D54] disabled:opacity-40"
          >
            {loading ? (
              <>
                <Spinner className="h-3.5 w-3.5 text-white" /> Processando...
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
          {error && (
            <p className="rounded border border-[#EF4444] bg-[#FEF2F2] px-1.5 py-1 text-[#B91C1C]">{error}</p>
          )}

          {preview && (
            <div className="space-y-1 rounded border border-[#E2E8F0] bg-[#F8FAFC] p-1">
              <div className="flex gap-2">
                <div>
                  <p className="text-[#64748B]">antes</p>
                  <img src={image.url} alt="" className="h-28 w-28 rounded object-contain" />
                </div>
                <div>
                  <p className="text-[#64748B]">depois</p>
                  <img
                    src={preview.previewUrl}
                    alt=""
                    className="h-28 w-28 rounded object-contain"
                    style={{
                      backgroundImage:
                        "linear-gradient(45deg, #E2E8F0 25%, transparent 25%), linear-gradient(-45deg, #E2E8F0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #E2E8F0 75%), linear-gradient(-45deg, transparent 75%, #E2E8F0 75%)",
                      backgroundSize: "10px 10px",
                      backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0px",
                    }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-[#64748B]">Aplicado: {preview.operations.map(describeOperation).join(", ")}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleConfirm}
                  className="flex-1 rounded bg-[#22C55E] px-2 py-1 text-white hover:opacity-90 disabled:opacity-40"
                >
                  Confirmar
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
