import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { Category, ProductImage } from "../types";
import { DynamicAttributeFields } from "../components/DynamicAttributeFields";
import { ImageManager } from "../components/ImageManager";

const DIACRITICS_REGEX = new RegExp("[̀-ͯ]", "g");

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function ProductForm() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [productId, setProductId] = useState<string | null>(id ?? null);
  const [images, setImages] = useState<ProductImage[]>([]);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [sku, setSku] = useState("");
  const [trackStock, setTrackStock] = useState(false);
  const [stockQty, setStockQty] = useState("");
  const [attributes, setAttributes] = useState<Record<string, unknown>>({});

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);

  const selectedCategory = useMemo(() => categories.find((c) => c.id === categoryId), [categories, categoryId]);

  useEffect(() => {
    api.listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    if (!id) return;
    api
      .getProduct(id)
      .then((product) => {
        setName(product.name);
        setSlug(product.slug);
        setSlugTouched(true);
        setDescription(product.description ?? "");
        setCategoryId(product.categoryId);
        setPrice(String(product.price));
        setSku(product.sku ?? "");
        setTrackStock(product.trackStock);
        setStockQty(product.stockQty !== null ? String(product.stockQty) : "");
        setAttributes(product.attributes);
        setImages(product.images);
        setProductId(product.id);
      })
      .finally(() => setLoading(false));
  }, [id]);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handleAttributeChange(key: string, value: unknown) {
    setAttributes((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      name,
      slug,
      description: description || null,
      categoryId,
      price: Number(price),
      sku: sku || null,
      trackStock,
      stockQty: trackStock && stockQty !== "" ? Number(stockQty) : null,
      attributes,
    };

    try {
      if (productId) {
        await api.updateProduct(productId, payload);
        navigate("/produtos");
      } else {
        const created = await api.createProduct(payload);
        setProductId(created.id);
        navigate(`/produtos/${created.id}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao salvar produto");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-slate-500">Carregando...</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-800">{isEditing ? "Editar produto" : "Novo produto"}</h1>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border bg-white p-6">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Nome</label>
            <input
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Slug</label>
            <input
              required
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Categoria</label>
            <select
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Selecione...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">SKU</label>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Preço (R$)</label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>

          <div className="flex items-end gap-3">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={trackStock}
                  onChange={(e) => setTrackStock(e.target.checked)}
                  className="h-4 w-4"
                />
                Controlar estoque
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Desmarcado = peça única, sem controle de quantidade.
              </p>
            </div>
            {trackStock && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Qtd. em estoque</label>
                <input
                  type="number"
                  min="0"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className="mt-1 w-32 rounded border border-slate-300 px-3 py-2"
                />
              </div>
            )}
          </div>
        </div>

        {selectedCategory && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Campos técnicos — {selectedCategory.name}
            </h2>
            <DynamicAttributeFields
              schema={selectedCategory.attributeSchema}
              values={attributes}
              onChange={handleAttributeChange}
            />
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-slate-800 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar produto"}
          </button>
        </div>
      </form>

      <div className="mt-6 rounded-lg border bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Fotos</h2>
        {productId ? (
          <ImageManager productId={productId} images={images} onChange={setImages} />
        ) : (
          <p className="text-sm text-slate-500">Salve o produto para poder adicionar fotos.</p>
        )}
      </div>
    </div>
  );
}
