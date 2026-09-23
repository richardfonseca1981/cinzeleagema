import { clearSession, getSession } from "./auth";
import type {
  AdminSession,
  Category,
  PhotoTreatmentPreviewResult,
  Product,
  ProductImage,
  ProductListResponse,
} from "../types";

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
    window.location.href = "/login";
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

  listCategories: () => request<Category[]>("/api/categories"),
  createCategory: (data: Partial<Category>) =>
    request<Category>("/api/categories", { method: "POST", body: JSON.stringify(data) }),

  listProducts: (params: { categoryId?: string; active?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (params.categoryId) query.set("categoryId", params.categoryId);
    if (params.active !== undefined) query.set("active", String(params.active));
    return request<ProductListResponse>(`/api/products?${query.toString()}`);
  },
  getProduct: (id: string) => request<Product>(`/api/products/${id}`),
  createProduct: (data: Record<string, unknown>) =>
    request<Product>("/api/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Record<string, unknown>) =>
    request<Product>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deactivateProduct: (id: string) => request<Product>(`/api/products/${id}/deactivate`, { method: "PATCH" }),
  activateProduct: (id: string) => request<Product>(`/api/products/${id}/activate`, { method: "PATCH" }),

  presignImageUpload: (productId: string, fileName: string, contentType: string) =>
    request<{ uploadUrl: string; key: string; publicUrl: string }>(`/api/products/${productId}/images/presign`, {
      method: "POST",
      body: JSON.stringify({ fileName, contentType }),
    }),
  confirmImageUpload: (productId: string, url: string, key: string) =>
    request<ProductImage>(`/api/products/${productId}/images`, {
      method: "POST",
      body: JSON.stringify({ url, key }),
    }),
  reorderImages: (productId: string, order: string[]) =>
    request<ProductImage[]>(`/api/products/${productId}/images/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ order }),
    }),
  deleteImage: (productId: string, imageId: string) =>
    request<void>(`/api/products/${productId}/images/${imageId}`, { method: "DELETE" }),

  previewPhotoTreatment: (productId: string, imageId: string, instruction: string) =>
    request<PhotoTreatmentPreviewResult>(`/api/products/${productId}/images/${imageId}/treatment/preview`, {
      method: "POST",
      body: JSON.stringify({ instruction }),
    }),
  confirmPhotoTreatment: (productId: string, imageId: string, previewUrl: string, previewKey: string) =>
    request<ProductImage>(`/api/products/${productId}/images/${imageId}/treatment/confirm`, {
      method: "POST",
      body: JSON.stringify({ previewUrl, previewKey }),
    }),
  discardPhotoTreatment: (productId: string, imageId: string, previewKey: string) =>
    request<void>(`/api/products/${productId}/images/${imageId}/treatment/discard`, {
      method: "POST",
      body: JSON.stringify({ previewKey }),
    }),
  undoPhotoTreatment: (productId: string, imageId: string) =>
    request<ProductImage>(`/api/products/${productId}/images/${imageId}/undo`, { method: "POST" }),
};

export async function uploadImageToR2(productId: string, file: File): Promise<ProductImage> {
  const { uploadUrl, key, publicUrl } = await api.presignImageUpload(productId, file.name, file.type);

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) {
    throw new ApiError(putRes.status, "Falha ao enviar imagem para o armazenamento");
  }

  return api.confirmImageUpload(productId, publicUrl, key);
}

export { ApiError };
