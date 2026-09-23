import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useToast } from "../components/Toast";
import type { Category, Product } from "../types";

export function ProductList() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .listProducts({ categoryId: categoryFilter || undefined })
      .then((res) => setProducts(res.items))
      .finally(() => setLoading(false));
  }, [categoryFilter]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => p.name.toLowerCase().includes(term));
  }, [products, search]);

  async function handleToggleActive(product: Product) {
    try {
      const updated = product.active ? await api.deactivateProduct(product.id) : await api.activateProduct(product.id);
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast("success", updated.active ? "Produto ativado" : "Produto desativado");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível atualizar o produto");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#1A1A1A]">Produtos</h1>
        <Link
          to="/produtos/novo"
          className="rounded-lg bg-[#1B3A6B] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#152D54]"
        >
          Novo produto
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome..."
          className="min-w-[220px] flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#EFF6FF]"
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#F8FAFC] text-[#64748B]">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Categoria</th>
              <th className="px-4 py-2">Preço</th>
              <th className="px-4 py-2">Estoque</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#64748B]">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && filteredProducts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <p className="font-medium text-[#1A1A1A]">
                    {products.length === 0 ? "Nenhum produto cadastrado ainda" : "Nenhum produto encontrado"}
                  </p>
                  <p className="mt-1 text-sm text-[#64748B]">
                    {products.length === 0
                      ? 'Clique em "Novo produto" para cadastrar a primeira peça do catálogo.'
                      : "Tente ajustar a busca ou o filtro de categoria."}
                  </p>
                </td>
              </tr>
            )}
            {filteredProducts.map((product) => (
              <tr key={product.id} className={`border-t border-[#E2E8F0] ${!product.active ? "bg-[#F8FAFC]" : ""}`}>
                <td className="px-4 py-2 text-[#1A1A1A]">{product.name}</td>
                <td className="px-4 py-2 text-[#64748B]">{product.category.name}</td>
                <td className="px-4 py-2 text-[#1A1A1A]">
                  {Number(product.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td className="px-4 py-2 text-[#64748B]">
                  {product.trackStock ? product.stockQty : "Peça única"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      product.active
                        ? "border-[#22C55E] bg-[#F0FDF4] text-[#15803D]"
                        : "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"
                    }`}
                  >
                    {product.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link to={`/produtos/${product.id}`} className="mr-3 text-[#1B3A6B] hover:underline">
                    Editar
                  </Link>
                  <button onClick={() => handleToggleActive(product)} className="text-[#64748B] hover:underline">
                    {product.active ? "Desativar" : "Ativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
