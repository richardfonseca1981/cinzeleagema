import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { ProductImage } from "../types";
import { ImageManager } from "../components/ImageManager";
import { useToast } from "../components/Toast";

const DIACRITICS_REGEX = new RegExp("[̀-ͯ]", "g");

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const inputClass =
  "mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 outline-none transition focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]";
const labelClass = "block text-sm font-medium text-[#1A1A1A]";

export function ProductForm() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [productId, setProductId] = useState<string | null>(id ?? null);
  const [images, setImages] = useState<ProductImage[]>([]);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [sku, setSku] = useState("");
  const [weightGrams, setWeightGrams] = useState("");
  const [sizeCm, setSizeCm] = useState("");
  const [trackStock, setTrackStock] = useState(false);
  const [stockQty, setStockQty] = useState("");

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);

  useEffect(() => {
    if (!id) return;
    api
      .getProduct(id)
      .then((product) => {
        setName(product.name);
        setSlug(product.slug);
        setSlugTouched(true);
        setDescription(product.description ?? "");
        setPrice(String(product.price));
        setSku(product.sku ?? "");
        setWeightGrams(String(product.weightGrams));
        setSizeCm(String(product.sizeCm));
        setTrackStock(product.trackStock);
        setStockQty(product.stockQty !== null ? String(product.stockQty) : "");
        setImages(product.images);
        setProductId(product.id);
      })
      .finally(() => setLoading(false));
  }, [id]);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      name,
      slug,
      description: description || null,
      price: Number(price),
      sku: sku || null,
      weightGrams: Number(weightGrams),
      sizeCm: Number(sizeCm),
      trackStock,
      stockQty: trackStock && stockQty !== "" ? Number(stockQty) : null,
    };

    try {
      if (productId) {
        await api.updateProduct(productId, payload);
        showToast("success", "Produto atualizado com sucesso");
        navigate("/admin/produtos");
      } else {
        const created = await api.createProduct(payload);
        setProductId(created.id);
        showToast("success", "Produto criado com sucesso");
        navigate(`/admin/produtos/${created.id}`, { replace: true });
      }
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível salvar o produto");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-[#64748B]">Carregando...</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-[#1A1A1A]">{isEditing ? "Editar produto" : "Novo produto"}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-lg border border-[#E2E8F0] bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-[#1A1A1A]">Dados do produto</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nome</label>
              <input required value={name} onChange={(e) => handleNameChange(e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Slug</label>
              <input
                required
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                className={inputClass}
              />
            </div>

            <div className="col-span-2">
              <label className={labelClass}>Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>SKU</label>
              <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Preço (R$)</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Peso (gramas)</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Tamanho (centímetros)</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={sizeCm}
                onChange={(e) => setSizeCm(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex items-end gap-3">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-[#1A1A1A]">
                  <input
                    type="checkbox"
                    checked={trackStock}
                    onChange={(e) => setTrackStock(e.target.checked)}
                    className="h-4 w-4 accent-[#1B3A6B]"
                  />
                  Controlar estoque
                </label>
                <p className="mt-1 text-xs text-[#64748B]">Desmarcado = peça única, sem controle de quantidade.</p>
              </div>
              {trackStock && (
                <div>
                  <label className={labelClass}>Qtd. em estoque</label>
                  <input
                    type="number"
                    min="0"
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    className={`${inputClass} w-32`}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#1B3A6B] px-4 py-2 font-medium text-white transition hover:bg-[#152D54] disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar produto"}
          </button>
        </div>
      </form>

      <div className="mt-6 rounded-lg border border-[#E2E8F0] bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-[#1A1A1A]">Fotos</h2>
        {productId ? (
          <ImageManager productId={productId} images={images} onChange={setImages} />
        ) : (
          <p className="text-sm text-[#64748B]">Salve o produto para poder adicionar fotos.</p>
        )}
      </div>
    </div>
  );
}
