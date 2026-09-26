export interface ProductImage {
  id: string;
  url: string;
  key: string;
  position: number;
  previousUrl?: string | null;
  previousKey?: string | null;
}

export interface PhotoTreatmentOperation {
  operation:
    | "resize"
    | "crop"
    | "brightness"
    | "contrast"
    | "sharpen"
    | "rotate"
    | "compress"
    | "convertFormat"
    | "removeBackground";
  width?: number;
  height?: number;
  aspectRatio?: "1:1" | "4:3" | "16:9";
  value?: number;
  intensity?: "leve" | "médio" | "forte";
  degrees?: 90 | 180 | 270;
  quality?: number;
  format?: "webp" | "jpeg" | "png";
}

export type PhotoTreatmentPreviewResult =
  | { unclear: true; suggestion?: string }
  | { unclear: false; operations: PhotoTreatmentOperation[]; previewUrl: string; previewKey: string };

export interface Subcategory {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  subcategories: Subcategory[];
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  subcategoryId: string | null;
  category?: { id: string; name: string; slug: string };
  subcategory?: { id: string; name: string; slug: string; categoryId: string } | null;
  price: string;
  sku: string | null;
  weightGrams: string;
  sizeCm: string;
  trackStock: boolean;
  stockQty: number | null;
  images: ProductImage[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminSession {
  token: string;
  admin: { id: string; username: string; role: string };
}

export interface AdminUserSummary {
  id: string;
  username: string;
  role: string;
  active: boolean;
  createdAt: string;
}

export interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  imageUrl: string | null;
  quantity: number;
}

export interface CreateOrderResult {
  delivered: boolean;
}
