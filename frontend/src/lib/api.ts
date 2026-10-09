import { clearSession, getSession } from "./auth";
import type {
  AdminSession,
  AdminUserSummary,
  Category,
  ColorEnhanceLevel,
  CreateOrderResult,
  PhotoTreatmentPreviewResult,
  PhotoTreatmentRawPreviewResult,
  Product,
  ProductImage,
  ProductListResponse,
  TreatmentPreviewRequest,
} from "../types";
import type { NewEntry } from "./imageStaging";
import { rawFormFields } from "./treatmentRequest";

const API_URL = import.meta.env.VITE_API_URL;

class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getSession();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    clearSession();
    window.location.href = "/admin";
    throw new ApiError(401, "Sessão expirada");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? "Erro na requisição", body.details);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (username: string, password: string) =>
    request<AdminSession>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  listAdminUsers: () => request<AdminUserSummary[]>("/api/admin-users"),
  createAdminUser: (data: { username: string; password: string }) =>
    request<AdminUserSummary>("/api/admin-users", { method: "POST", body: JSON.stringify(data) }),
  deactivateAdminUser: (id: string) =>
    request<AdminUserSummary>(`/api/admin-users/${id}/deactivate`, { method: "PATCH" }),

  listCategories: () => request<Category[]>("/api/categories"),

  getExchangeRate: () => request<{ rate: number; updatedAt: string }>("/api/exchange-rate"),

  listProducts: (
    params: { active?: boolean; categoryId?: string; subcategoryId?: string; q?: string; page?: number; pageSize?: number } = {}
  ) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.active !== undefined) query.set("active", String(params.active));
    if (params.categoryId) query.set("categoryId", params.categoryId);
    if (params.subcategoryId) query.set("subcategoryId", params.subcategoryId);
    if (params.page !== undefined) query.set("page", String(params.page));
    if (params.pageSize !== undefined) query.set("pageSize", String(params.pageSize));
    return request<ProductListResponse>(`/api/products?${query.toString()}`);
  },
  // Admin: quantas peças já têm a capa em 9:16.
  getPhotoStats: () => request<{ total: number; portrait: number }>("/api/products/photo-stats"),
  getProduct: (id: string) => request<Product>(`/api/products/${id}`),

  createOrder: (data: {
    customerName: string;
    customerPhone: string;
    items: { productId: string; name: string; quantity: number; unitPrice: number }[];
    totalEstimate: number;
  }) => request<CreateOrderResult>("/api/orders", { method: "POST", body: JSON.stringify(data) }),
  createProduct: (data: Record<string, unknown>) =>
    request<Product>("/api/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Record<string, unknown>) =>
    request<Product>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deactivateProduct: (id: string) => request<Product>(`/api/products/${id}/deactivate`, { method: "PATCH" }),
  // Exclusão DEFINITIVA (só peça inativa): uma peça por vez, com confirmação no admin.
  deleteProduct: (id: string) =>
    request<{ deleted: true; photosRemoved: number; filesFailed: number }>(`/api/products/${id}`, { method: "DELETE" }),
  activateProduct: (id: string) => request<Product>(`/api/products/${id}/activate`, { method: "PATCH" }),

  reorderImages: (productId: string, order: string[]) =>
    request<ProductImage[]>(`/api/products/${productId}/images/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ order }),
    }),
  deleteImage: (productId: string, imageId: string) =>
    request<void>(`/api/products/${productId}/images/${imageId}`, { method: "DELETE" }),

  previewPhotoTreatment: (productId: string, imageId: string, body: TreatmentPreviewRequest) =>
    request<PhotoTreatmentPreviewResult>(`/api/products/${productId}/images/${imageId}/treatment/preview`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  confirmPhotoTreatment: (
    productId: string,
    imageId: string,
    previewUrl: string,
    previewKey: string,
    colorEnhance?: { colorEnhanced: boolean; colorEnhanceLevel: ColorEnhanceLevel | null }
  ) =>
    request<ProductImage>(`/api/products/${productId}/images/${imageId}/treatment/confirm`, {
      method: "POST",
      body: JSON.stringify({
        previewUrl,
        previewKey,
        ...(colorEnhance?.colorEnhanced
          ? { colorEnhanced: true, colorEnhanceLevel: colorEnhance.colorEnhanceLevel ?? undefined }
          : {}),
      }),
    }),
  discardPhotoTreatment: (productId: string, imageId: string, previewKey: string) =>
    request<void>(`/api/products/${productId}/images/${imageId}/treatment/discard`, {
      method: "POST",
      body: JSON.stringify({ previewKey }),
    }),
  undoPhotoTreatment: (productId: string, imageId: string) =>
    request<ProductImage>(`/api/products/${productId}/images/${imageId}/undo`, { method: "POST" }),
};

// Versão stateless do tratamento por IA, para fotos staged (sem productId/
// imageId reais ainda) — envia o arquivo bruto por multipart e recebe a
// imagem já tratada embutida na resposta; nunca grava nada no backend.
export async function previewPhotoTreatmentRaw(
  file: File,
  body: TreatmentPreviewRequest
): Promise<PhotoTreatmentRawPreviewResult> {
  const session = getSession();
  const formData = new FormData();
  formData.append("file", file);
  // multipart não tem JSON aninhado nativo: "operations" vai como string
  // JSON mesma (o backend faz o parse manual — ver imageTreatmentRaw.routes.ts).
  for (const [name, value] of rawFormFields(body)) formData.append(name, value);

  const res = await fetch(`${API_URL}/api/images/treatment-preview-raw`, {
    method: "POST",
    headers: session ? { Authorization: `Bearer ${session.token}` } : {},
    body: formData,
  });

  if (res.status === 401) {
    clearSession();
    window.location.href = "/admin";
    throw new ApiError(401, "Sessão expirada");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? "Erro na requisição", body.details);
  }
  return res.json();
}

// Envia a foto staged ao servidor, que a coloca no formato final 9:16 em pé
// (sem EXIF/GPS, lado maior ≤ 1920 px), grava no R2 e cria o ProductImage.
// Recebe a NewEntry inteira (não só o File) para repassar colorEnhanced/
// colorEnhanceLevel, caso a foto staged já tenha passado por realce de cor.
export async function uploadImageToR2(productId: string, entry: NewEntry): Promise<ProductImage> {
  const session = getSession();
  const formData = new FormData();
  formData.append("file", entry.file);
  formData.append("colorEnhanced", String(entry.colorEnhanced));
  if (entry.colorEnhanced && entry.colorEnhanceLevel) formData.append("colorEnhanceLevel", entry.colorEnhanceLevel);

  const res = await fetch(`${API_URL}/api/products/${productId}/images/upload`, {
    method: "POST",
    headers: session ? { Authorization: `Bearer ${session.token}` } : {},
    body: formData,
  });

  if (res.status === 401) {
    clearSession();
    window.location.href = "/admin";
    throw new ApiError(401, "Sessão expirada");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? "Falha ao enviar a foto", body.details);
  }
  return res.json();
}

export { ApiError };
