import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { Category, ProductImage } from "../types";
import { ImageManager, type ImageManagerHandle } from "../components/ImageManager";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { backToListPath } from "../lib/productListState";
import { canConfirmDelete, deleteConfirmTarget } from "../lib/productDelete";
import { isMissingKeyFields } from "../lib/activationWarning";

const inputClass =
  "mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 outline-none transition focus:border-[#C78F50] focus:ring-2 focus:ring-[#C78F50]/20";
const labelClass = "block text-sm font-medium text-[#1A1A1A]";

export function ProductForm() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  // A lista passa a query string atual (página, busca, filtros) em
  // location.state; ao salvar/cancelar volta exatamente para ela.
  const listPath = backToListPath(location.state);

  const [productId, setProductId] = useState<string | null>(id ?? null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [sku, setSku] = useState("");
  const [weightGrams, setWeightGrams] = useState("");
  const [sizeCm, setSizeCm] = useState("");
  const [trackStock, setTrackStock] = useState(false);
  const [stockQty, setStockQty] = useState("");

  const [saving, setSaving] = useState(false);
  const [savingPhase, setSavingPhase] = useState<"data" | "images" | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const imageManagerRef = useRef<ImageManagerHandle>(null);
  // Dados SALVOS da peça (não o que está sendo digitado) para a exclusão definitiva.
  const [saved, setSaved] = useState<{ name: string | null; sku: string | null; active: boolean } | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  // Aviso não-bloqueante (PARTE 3): salvar/ativar uma peça ativa sem nome,
  // preço ou foto pede confirmação explícita antes de seguir.
  const [showActivationWarning, setShowActivationWarning] = useState(false);

  useEffect(() => {
    api.listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    if (!id) return;
    api
      .getProduct(id)
      .then((product) => {
        setName(product.name ?? "");
        setDescription(product.description ?? "");
        setCategoryId(product.categoryId ?? "");
        setSubcategoryId(product.subcategoryId ?? "");
        setPrice(product.price !== null ? String(product.price) : "");
        setSku(product.sku ?? "");
        setWeightGrams(String(product.weightGrams));
        setSizeCm(String(product.sizeCm));
        setTrackStock(product.trackStock);
        setStockQty(product.stockQty !== null ? String(product.stockQty) : "");
        setImages(product.images ?? []);
        setSaved({ name: product.name, sku: product.sku, active: product.active });
        setProductId(product.id);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const selectedCategory = useMemo(() => categories.find((c) => c.id === categoryId), [categories, categoryId]);

  function handleCategoryChange(value: string) {
    setCategoryId(value);
    setSubcategoryId("");
  }

  // Nenhum campo é obrigatório (ver CONTEXT.md "campos opcionais"): nome,
  // preço e categoria vazios viram null — não string vazia nem NaN. Peso e
  // tamanho vazios viram 0, o mesmo sentinel que o site público já trata como
  // "ausente" (ver lib/format.ts). Slug nunca é enviado: é sempre gerado e
  // mantido pelo backend (ver product.schema.ts/product.routes.ts).
  function buildPayload() {
    const trimmedName = name.trim();
    return {
      name: trimmedName !== "" ? trimmedName : null,
      description: description || null,
      categoryId: categoryId || null,
      subcategoryId: selectedCategory && selectedCategory.subcategories.length > 0 ? subcategoryId : null,
      price: price.trim() !== "" ? Number(price) : null,
      sku: sku || null,
      weightGrams: weightGrams.trim() !== "" ? Number(weightGrams) : 0,
      sizeCm: sizeCm.trim() !== "" ? Number(sizeCm) : 0,
      trackStock,
      stockQty: trackStock && stockQty !== "" ? Number(stockQty) : null,
    };
  }

  async function doSave(payload: ReturnType<typeof buildPayload>) {
    setSaving(true);
    setSavingPhase("data");

    try {
      if (productId) {
        await api.updateProduct(productId, payload);

        // Dados do produto já salvos — agora processa as fotos pendentes
        // (upload das novas staged, exclusões marcadas e ordem final).
        if (imageManagerRef.current) {
          setSavingPhase("images");
          await imageManagerRef.current.commit();
        }

        showToast("success", "Produto atualizado com sucesso");
        navigate(listPath);
      } else {
        const created = await api.createProduct(payload);
        setProductId(created.id);
        showToast("success", "Produto criado com sucesso");
        navigate(`/admin/produtos/${created.id}`, { replace: true, state: location.state });
      }
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível salvar o produto");
    } finally {
      setSaving(false);
      setSavingPhase(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = buildPayload();

    // Peça nova sempre entra ativa (não há campo de ativo/inativo neste
    // formulário); editando, segue o status atual salvo. PARTE 3: avisa
    // (não bloqueia) se a peça vai ficar ativa sem nome, preço ou foto.
    const willBeActive = saved?.active ?? true;
    if (willBeActive && isMissingKeyFields({ name: payload.name, price: payload.price, hasPhoto: images.length > 0 })) {
      setShowActivationWarning(true);
      return;
    }

    await doSave(payload);
  }

  async function handleConfirmActivationWarning() {
    setShowActivationWarning(false);
    await doSave(buildPayload());
  }

  async function handleDeleteProduct() {
    if (!productId || !saved) return;
    setDeleting(true);
    try {
      const result = await api.deleteProduct(productId);
      if (result.filesFailed > 0) {
        showToast(
          "warning",
          `Peça excluída, mas ${result.filesFailed} arquivo(s) de foto não puderam ser removidos do armazenamento. Eles ficam sem uso e não aparecem no site.`
        );
      } else {
        showToast("success", "Peça excluída definitivamente");
      }
      navigate(listPath);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível excluir a peça. Nada foi apagado.");
      setDeleting(false);
    }
  }

  function handleCancel() {
    navigate(listPath);
  }

  if (loading) {
    return <p className="text-[#64748B]">Carregando...</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-[#1A1A1A]">{isEditing ? "Editar produto" : "Novo produto"}</h1>

      <div className="mb-6 rounded-lg border border-[#E2E8F0] bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-[#1A1A1A]">Fotos</h2>
        {productId ? (
          <ImageManager ref={imageManagerRef} productId={productId} images={images} onChange={setImages} />
        ) : (
          <p className="text-sm text-[#64748B]">Salve o produto para poder adicionar fotos.</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-lg border border-[#E2E8F0] bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-[#1A1A1A]">Dados do produto</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Nome</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                <p className="mt-1 text-xs text-[#64748B]">Opcional. Sem nome, a peça aparece como "(sem nome)" na lista.</p>
              </div>

              <div>
                <label className={labelClass}>Descrição</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Categoria</label>
                <select
                  value={categoryId}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCategory && selectedCategory.subcategories.length > 0 && (
                <div>
                  <label className={labelClass}>Subcategoria</label>
                  <select
                    required
                    value={subcategoryId}
                    onChange={(e) => setSubcategoryId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Selecione uma subcategoria
                    </option>
                    {selectedCategory.subcategories.map((subcategory) => (
                      <option key={subcategory.id} value={subcategory.id}>
                        {subcategory.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Peso (gramas)</label>
                <input
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
                  type="number"
                  step="0.01"
                  min="0"
                  value={sizeCm}
                  onChange={(e) => setSizeCm(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>SKU</label>
                <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>Preço (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
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
                      className="h-4 w-4 accent-[#C78F50]"
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
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#C78F50] px-4 py-2 font-medium text-[#010B1A] transition hover:bg-[#B37D3F] disabled:opacity-50"
          >
            {saving ? (savingPhase === "images" ? "Salvando fotos..." : "Salvando...") : "Salvar produto"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="rounded-lg border border-[#E2E8F0] px-4 py-2 font-medium text-[#1A1A1A] transition hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </form>

      {isEditing && saved && (
        <section className="mt-6 rounded-lg border border-[#FCA5A5] bg-white p-6">
          <h2 className="mb-2 text-sm font-semibold text-[#B91C1C]">Excluir peça</h2>
          <p className="mb-3 text-sm text-[#64748B]">
            Apaga a peça e todas as fotos dela de forma definitiva. Só é possível com a peça inativa.
          </p>
          <button
            type="button"
            disabled={saved.active || saving}
            onClick={() => {
              setTypedConfirm("");
              setShowDelete(true);
            }}
            className="rounded-lg bg-[#EF4444] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Excluir peça
          </button>
          {saved.active && <p className="mt-2 text-xs text-[#B45309]">Desative a peça antes de excluir.</p>}
        </section>
      )}

      {showDelete && saved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title" className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 id="delete-product-title" className="text-base font-semibold text-[#1A1A1A]">Excluir a peça definitivamente?</h2>
            <p className="mt-3 text-sm text-[#1A1A1A]">
              <strong>{saved.name || "(sem nome)"}</strong>
              {saved.sku ? ` — SKU ${saved.sku}` : " — sem SKU"}
            </p>
            <p className="mt-2 text-sm text-[#1A1A1A]">
              Serão apagadas <strong>{images.length} {images.length === 1 ? "foto" : "fotos"}</strong> e a peça. A exclusão é{" "}
              <strong>definitiva</strong> e não pode ser desfeita.
            </p>
            {(() => {
              const target = deleteConfirmTarget(saved);
              return (
                <>
                  <label className="mt-4 block text-sm font-medium text-[#1A1A1A]" htmlFor="confirm-delete">
                    Para confirmar, digite o {target.label} da peça: <span className="font-mono">{target.value}</span>
                  </label>
                  <input
                    id="confirm-delete"
                    autoFocus
                    autoComplete="off"
                    value={typedConfirm}
                    onChange={(e) => setTypedConfirm(e.target.value)}
                    className={inputClass}
                  />
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" disabled={deleting} onClick={() => setShowDelete(false)} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm hover:bg-[#F8FAFC] disabled:opacity-40">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={deleting || !canConfirmDelete(typedConfirm, target)}
                      onClick={handleDeleteProduct}
                      className="rounded-lg bg-[#EF4444] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {deleting ? "Excluindo..." : "Excluir definitivamente"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showActivationWarning}
        title="Ativar peça incompleta?"
        message='Esta peça está ativa (ou vai ficar), mas falta nome, preço ou foto — no site público ela aparece com "Consulte o valor"/placeholder onde faltar. Ativar mesmo assim?'
        confirmLabel="Ativar mesmo assim"
        onConfirm={handleConfirmActivationWarning}
        onCancel={() => setShowActivationWarning(false)}
      />
    </div>
  );
}
