import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Category, Product } from "../types";

export function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
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

  async function handleToggleActive(product: Product) {
    const updated = product.active ? await api.deactivateProduct(product.id) : await api.activateProduct(product.id);
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">Produtos</h1>
        <Link to="/produtos/novo" className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700">
          Novo produto
        </Link>
      </div>

      <div className="mb-4">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
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
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
            {products.map((product) => (
              <tr key={product.id} className="border-t">
                <td className="px-4 py-2">{product.name}</td>
                <td className="px-4 py-2">{product.category.name}</td>
                <td className="px-4 py-2">
                  {Number(product.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td className="px-4 py-2">
                  {product.trackStock ? product.stockQty : "Peça única"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      product.active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {product.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link to={`/produtos/${product.id}`} className="mr-3 text-slate-700 hover:underline">
                    Editar
                  </Link>
                  <button onClick={() => handleToggleActive(product)} className="text-slate-500 hover:underline">
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
