import { clearSession, getSession } from "./auth";
import type {
  AdminSession,
  AdminShippingRate,
  AdminShippingSimulation,
  AdminShippingZone,
  AdminUserSummary,
  Category,
  ColorEnhanceLevel,
  CreateOrderResult,
  PhotoTreatmentPreviewResult,
  PhotoTreatmentRawPreviewResult,
  Product,
  ProductImage,
  ProductListResponse,
  ShippingStatus,
  TreatmentPreviewRequest,
} from "../types";
import type { PostalCodeLookup, ShippingQuoteRequest, ShippingQuoteResult } from "./shipping/types";
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

  // `source` é novo (live | stale | fallback); pode faltar num backend antigo.
  getExchangeRate: () => request<{ rate: number; updatedAt: string; source?: string }>("/api/exchange-rate"),

  getShippingStatus: () => request<ShippingStatus>("/api/shipping/status"),
  // Frete do comprador (rotas públicas). O endpoint de cotação tem limite de
  // 20 requisições/min por IP: 429 é tratado na interface.
  getShippingQuote: (body: ShippingQuoteRequest, signal?: AbortSignal) =>
    request<ShippingQuoteResult>("/api/shipping/quote", { method: "POST", body: JSON.stringify(body), signal }),
  lookupPostalCode: (code: string, signal?: AbortSignal) =>
    request<PostalCodeLookup>(`/api/shipping/postal-code/${code}`, { signal }),

  // Frete internacional por tabela (admin)
  listShippingZones: () => request<AdminShippingZone[]>("/api/admin/shipping/zones"),
  createShippingZone: (data: { name: string; countries: string[]; active: boolean }) =>
    request<AdminShippingZone>("/api/admin/shipping/zones", { method: "POST", body: JSON.stringify(data) }),
  updateShippingZone: (id: string, data: { name?: string; countries?: string[]; active?: boolean }) =>
    request<AdminShippingZone>(`/api/admin/shipping/zones/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteShippingZone: (id: string) => request<void>(`/api/admin/shipping/zones/${id}`, { method: "DELETE" }),
  createShippingRate: (zoneId: string, data: Record<string, unknown>) =>
    request<AdminShippingRate>(`/api/admin/shipping/zones/${zoneId}/rates`, { method: "POST", body: JSON.stringify(data) }),
  updateShippingRate: (zoneId: string, rateId: string, data: Record<string, unknown>) =>
    request<AdminShippingRate>(`/api/admin/shipping/zones/${zoneId}/rates/${rateId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteShippingRate: (zoneId: string, rateId: string) =>
    request<void>(`/api/admin/shipping/zones/${zoneId}/rates/${rateId}`, { method: "DELETE" }),
  simulateShipping: (data: { country: string; weightGrams: number }) =>
    request<AdminShippingSimulation>("/api/admin/shipping/simulate", { method: "POST", body: JSON.stringify(data) }),

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
  activateProduct: (id: string) => request<Product>(`/api/products/${id}/activate`, { method: "PATCH" }),

  presignImageUpload: (productId: string, fileName: string, contentType: string) =>
    request<{ uploadUrl: string; key: string; publicUrl: string }>(`/api/products/${productId}/images/presign`, {
      method: "POST",
      body: JSON.stringify({ fileName, contentType }),
    }),
  confirmImageUpload: (
    productId: string,
    url: string,
    key: string,
    colorEnhance?: { colorEnhanced: boolean; colorEnhanceLevel: ColorEnhanceLevel | null }
  ) =>
    request<ProductImage>(`/api/products/${productId}/images`, {
      method: "POST",
      body: JSON.stringify({
        url,
        key,
        ...(colorEnhance?.colorEnhanced
          ? { colorEnhanced: true, colorEnhanceLevel: colorEnhance.colorEnhanceLevel ?? undefined }
          : {}),
      }),
    }),
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

// Recebe a NewEntry inteira (não só o File) para repassar colorEnhanced/
// colorEnhanceLevel ao criar o ProductImage, caso a foto staged já tenha
// passado por um tratamento de realce de cor antes do upload.
export async function uploadImageToR2(productId: string, entry: NewEntry): Promise<ProductImage> {
  const { uploadUrl, key, publicUrl } = await api.presignImageUpload(productId, entry.file.name, entry.file.type);

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": entry.file.type },
    body: entry.file,
  });
  if (!putRes.ok) {
    throw new ApiError(putRes.status, "Falha ao enviar imagem para o armazenamento");
  }

  return api.confirmImageUpload(productId, publicUrl, key, {
    colorEnhanced: entry.colorEnhanced,
    colorEnhanceLevel: entry.colorEnhanceLevel,
  });
}

export { ApiError };
