import type { Category } from "../types";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "./pagination";

// Estado da lista de produtos do admin na URL (query string): assim F5, o
// botão Voltar e o retorno depois de editar/criar um produto voltam à mesma
// página e aos mesmos filtros. Tudo puro (sem React) para ser testável.

export type StatusFilter = "all" | "active" | "inactive";

export interface ProductListState {
  page: number;
  pageSize: number;
  q: string;
  category: string;
  subcategory: string;
  status: StatusFilter;
}

export const DEFAULT_LIST_STATE: ProductListState = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  q: "",
  category: "",
  subcategory: "",
  status: "all",
};

// Mesmo limite do backend (q: máx. 100 caracteres).
export const MAX_QUERY_LENGTH = 100;
// Teto só para descartar lixo na URL; a página real é ajustada ao total depois da carga.
const MAX_PAGE_PARAM = 100000;
const MAX_ID_LENGTH = 100;

export const LIST_BASE_PATH = "/admin/produtos";

function parsePositiveInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_PAGE_PARAM ? n : null;
}

function parseId(value: string | null): string {
  const v = (value ?? "").trim();
  return v.length > 0 && v.length <= MAX_ID_LENGTH ? v : "";
}

// Lê o estado da URL; qualquer valor inválido cai para o padrão (nunca lança).
export function parseListState(input: URLSearchParams | string): ProductListState {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;

  const page = parsePositiveInt(params.get("page")) ?? DEFAULT_LIST_STATE.page;

  const rawSize = parsePositiveInt(params.get("pageSize"));
  const pageSize = rawSize !== null && (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;

  const q = (params.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const category = parseId(params.get("category"));
  // Subcategoria só faz sentido dentro de uma categoria.
  const subcategory = category ? parseId(params.get("subcategory")) : "";

  const rawStatus = params.get("status");
  const status: StatusFilter = rawStatus === "active" || rawStatus === "inactive" ? rawStatus : "all";

  return { page, pageSize, q, category, subcategory, status };
}

// Escreve só o que difere do padrão (URL curta: /admin/produtos sem filtros).
export function serializeListState(state: ProductListState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.page > 1) params.set("page", String(state.page));
  if (state.pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(state.pageSize));
  if (state.q) params.set("q", state.q);
  if (state.category) params.set("category", state.category);
  if (state.category && state.subcategory) params.set("subcategory", state.subcategory);
  if (state.status !== "all") params.set("status", state.status);
  return params;
}

// "?page=2&q=ametista" ou "" — usado para voltar à lista depois de editar.
export function listStateToSearch(state: ProductListState): string {
  const s = serializeListState(state).toString();
  return s ? `?${s}` : "";
}

export interface ListProductsParams {
  page: number;
  pageSize: number;
  q?: string;
  categoryId?: string;
  subcategoryId?: string;
  active?: boolean;
}

export function toApiParams(state: ProductListState): ListProductsParams {
  return {
    page: state.page,
    pageSize: state.pageSize,
    ...(state.q ? { q: state.q } : {}),
    ...(state.category ? { categoryId: state.category } : {}),
    ...(state.subcategory ? { subcategoryId: state.subcategory } : {}),
    ...(state.status === "all" ? {} : { active: state.status === "active" }),
  };
}

// Aplica uma mudança de filtro: qualquer mudança que não seja só a própria
// página volta para a página 1 (busca, categoria, subcategoria, status,
// itens por página). Trocar a categoria zera a subcategoria.
export function applyChange(state: ProductListState, patch: Partial<ProductListState>): ProductListState {
  const next: ProductListState = { ...state, ...patch };
  if (patch.category !== undefined && patch.category !== state.category && patch.subcategory === undefined) {
    next.subcategory = "";
  }
  const changedFilter =
    next.q !== state.q ||
    next.category !== state.category ||
    next.subcategory !== state.subcategory ||
    next.status !== state.status ||
    next.pageSize !== state.pageSize;
  if (changedFilter && patch.page === undefined) next.page = 1;
  return next;
}

// Depois que as categorias carregam: remove da URL categoria/subcategoria que
// não existem (link antigo, valor digitado à mão) em vez de mostrar lista vazia.
export function sanitizeAgainstCategories(state: ProductListState, categories: Category[]): ProductListState {
  if (!state.category) return state;
  const category = categories.find((c) => c.id === state.category);
  if (!category) return { ...state, category: "", subcategory: "", page: 1 };
  if (state.subcategory && !category.subcategories.some((s) => s.id === state.subcategory)) {
    return { ...state, subcategory: "", page: 1 };
  }
  return state;
}

// Rota de volta para a lista a partir da edição/criação: o link da lista
// passa a query string atual em location.state ({ from: "?page=2&q=..." }).
export function backToListPath(locationState: unknown): string {
  const from = (locationState as { from?: unknown } | null)?.from;
  if (typeof from === "string" && from.startsWith("?") && from.length <= 500) return `${LIST_BASE_PATH}${from}`;
  return LIST_BASE_PATH;
}
