// Nível fechado do realce de cor (enhance_color) — mesmo enum validado no
// backend (lib/imageOperations.ts). "medio" sem acento mesmo (consistente
// com o parâmetro aceito pela API, diferente do "médio" acentuado do sharpen).
export type ColorEnhanceLevel = "leve" | "medio" | "forte";

export interface ProductImage {
  id: string;
  url: string;
  key: string;
  position: number;
  previousUrl?: string | null;
  previousKey?: string | null;
  colorEnhanced?: boolean;
  colorEnhanceLevel?: ColorEnhanceLevel | null;
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
    | "removeBackground"
    | "autoFit"
    | "enhance_color";
  width?: number;
  height?: number;
  aspectRatio?: "1:1" | "4:3" | "16:9";
  value?: number;
  intensity?: "leve" | "médio" | "forte";
  degrees?: 90 | 180 | 270;
  quality?: number;
  format?: "webp" | "jpeg" | "png";
  level?: ColorEnhanceLevel;
}

// Corpo de POST /treatment/preview (e multipart equivalente): texto livre
// (via Claude) OU operações prontas dos atalhos do admin — nunca os dois.
export type TreatmentPreviewRequest = { instruction: string } | { operations: PhotoTreatmentOperation[] };

// "noChange": o tratamento (ex.: "Enquadrar peça" numa foto já enquadrada) não
// alterou a imagem — não há preview, só um aviso em português (notice).
export type PhotoTreatmentNoChange = { unclear: false; noChange: true; operations: PhotoTreatmentOperation[]; notice: string };

export type PhotoTreatmentPreviewReady = {
  unclear: false;
  noChange?: undefined;
  operations: PhotoTreatmentOperation[];
  previewUrl: string;
  previewKey: string;
  notice?: string;
};

export type PhotoTreatmentPreviewResult = { unclear: true; suggestion?: string } | PhotoTreatmentNoChange | PhotoTreatmentPreviewReady;

// Resultado da rota stateless (/api/images/treatment-preview-raw), usada para
// tratar fotos staged (ainda não enviadas ao R2) — a imagem tratada volta
// embutida na resposta em vez de uma URL já hospedada.
export type PhotoTreatmentRawPreviewReady = {
  unclear: false;
  noChange?: undefined;
  operations: PhotoTreatmentOperation[];
  previewDataUrl: string;
  notice?: string;
};

export type PhotoTreatmentRawPreviewResult = { unclear: true; suggestion?: string } | PhotoTreatmentNoChange | PhotoTreatmentRawPreviewReady;

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
  // Tradução automática (Claude) — null quando ainda não traduzido ou a
  // tradução falhou; o site público cai para name/description nesse caso.
  nameEn: string | null;
  descriptionEn: string | null;
  categoryId: string;
  subcategoryId: string | null;
  category?: { id: string; name: string; slug: string };
  subcategory?: { id: string; name: string; slug: string; categoryId: string } | null;
  price: string;
  sku: string | null;
  weightGrams: string;
  sizeCm: string;
  // Dimensões reais da caixa de envio — opcionais, só corrigem a estimativa
  // automática de frete (ver backend lib/shipping/packageEstimator.ts).
  packageLengthCm: string | null;
  packageWidthCm: string | null;
  packageHeightCm: string | null;
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
  nameEn: string | null;
  unitPrice: number;
  imageUrl: string | null;
  weightGrams: number;
  sizeCm: number;
  quantity: number;
}

export interface CreateOrderResult {
  delivered: boolean;
}

// GET /api/shipping/status (admin, somente leitura) — nunca traz valores de
// variáveis, só se estão configuradas. `international` fica null até a
// Parte 1B (frete internacional) implementar essa seção.
export interface ShippingStatus {
  domestic: {
    melhorEnvioTokenConfigured: boolean;
    originCepConfigured: boolean;
    sandbox: boolean;
  };
  international: null;
}
