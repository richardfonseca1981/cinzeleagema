// Nível fechado do realce de cor (enhance_color) — mesmo enum validado no
// backend (lib/imageOperations.ts). "medio" sem acento mesmo (consistente
// com o parâmetro aceito pela API, diferente do "médio" acentuado do sharpen).
export type ColorEnhanceLevel = "leve" | "medio" | "forte";

export interface ProductImage {
  id: string;
  url: string;
  key: string;
  position: number;
  // Dimensões da foto exibida; ausentes/null em fotos antigas (proporção desconhecida).
  width?: number | null;
  height?: number | null;
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
  aspectRatio?: "1:1" | "4:3" | "9:16";
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
  // Null = peça sem nome ainda (ver CONTEXT.md "campos opcionais"). O site
  // público cai para SKU ou "Peça sem nome" (ver lib/format.ts); o admin
  // mostra "(sem nome)".
  name: string | null;
  slug: string;
  description: string | null;
  // Tradução automática (Claude) — null quando ainda não traduzido ou a
  // tradução falhou; o site público cai para name/description nesse caso.
  nameEn: string | null;
  descriptionEn: string | null;
  // Null = peça sem categoria ainda — aparece só na listagem geral.
  categoryId: string | null;
  subcategoryId: string | null;
  category?: { id: string; name: string; slug: string } | null;
  subcategory?: { id: string; name: string; slug: string; categoryId: string } | null;
  // Null = "Consulte o valor" (nunca entra em carrinho/total). Diferente de
  // "0", que é um preço real.
  price: string | null;
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
  // Peça sem preço nunca entra no carrinho (ver lib/format.ts
  // canAddToCart) — então, uma vez aqui, o item sempre tem nome resolvido
  // na hora de exibir (ver lib/format.ts localizeProductName), que cai
  // para o SKU quando a peça não tem nome.
  name: string | null;
  nameEn: string | null;
  sku: string | null;
  unitPrice: number;
  imageUrl: string | null;
  weightGrams: number;
  sizeCm: number;
  quantity: number;
}

export interface CreateOrderResult {
  delivered: boolean;
}
