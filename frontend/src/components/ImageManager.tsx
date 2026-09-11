import { useRef, useState } from "react";
import { api, uploadImageToR2 } from "../lib/api";
import type { PhotoTreatmentPreviewResult, ProductImage } from "../types";

interface ImageManagerProps {
  productId: string;
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
}

export function ImageManager({ productId, images, onChange }: ImageManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const image = await uploadImageToR2(productId, file);
      onChange([...images, image].sort((a, b) => a.position - b.position));
    } catch {
      setError("Não foi possível enviar a imagem. Verifique a configuração do R2.");
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
  }

  function handleImageUpdated(updated: ProductImage) {
    onChange(images.map((img) => (img.id === updated.id ? updated : img)));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3">
        {images.map((image, index) => (
          <div key={image.id} className="relative w-48 rounded border bg-white p-1 shadow-sm">
            <img src={image.url} alt="" className="h-32 w-full rounded object-cover" />
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => handleMove(index, -1)}
                className="disabled:opacity-30"
              >
                ↑
              </button>
              <button type="button" onClick={() => handleDelete(image.id)} className="text-red-500">
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
            <ImageTreatmentPanel productId={productId} image={image} onUpdated={handleImageUpdated} />
          </div>
        ))}
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        disabled={uploading}
        className="text-sm"
      />
      {uploading && <span className="ml-2 text-sm text-slate-500">Enviando...</span>}
    </div>
  );
}

interface ImageTreatmentPanelProps {
  productId: string;
  image: ProductImage;
  onUpdated: (image: ProductImage) => void;
}

function ImageTreatmentPanel({ productId, image, onUpdated }: ImageTreatmentPanelProps) {
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
    } catch {
      setError("Não foi possível desfazer o tratamento.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 border-t pt-2 text-xs">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-slate-600 underline decoration-dotted"
        >
          {open ? "fechar" : "tratar com IA"}
        </button>
        {image.previousUrl && (
          <button type="button" disabled={loading} onClick={handleUndo} className="text-slate-500 underline">
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
            className="w-full rounded border p-1 text-xs"
          />
          <button
            type="button"
            onClick={handleApply}
            disabled={loading || !instruction.trim()}
            className="rounded bg-slate-700 px-2 py-1 text-white disabled:opacity-40"
          >
            {loading ? "Processando..." : "Aplicar"}
          </button>

          {suggestion && <p className="text-amber-600">Pedido pouco claro: {suggestion}</p>}
          {error && <p className="text-red-600">{error}</p>}

          {preview && (
            <div className="space-y-1">
              <div className="flex gap-2">
                <div>
                  <p className="text-slate-400">antes</p>
                  <img src={image.url} alt="" className="h-20 w-20 rounded object-cover" />
                </div>
                <div>
                  <p className="text-slate-400">depois</p>
                  <img src={preview.previewUrl} alt="" className="h-20 w-20 rounded object-cover" />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleConfirm}
                  className="rounded bg-emerald-600 px-2 py-1 text-white disabled:opacity-40"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleDiscard}
                  className="rounded bg-slate-200 px-2 py-1 text-slate-700 disabled:opacity-40"
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
