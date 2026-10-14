import type { ProductImage } from "../types";

// Itens da galeria da peça. Hoje só "image"; "video" entra aqui depois sem
// refazer a galeria (basta tratar o novo "type" na renderização).
export type GalleryItem = { type: "image"; id: string; url: string };

export function galleryItemsFromImages(images: ProductImage[]): GalleryItem[] {
  return [...images]
    .sort((a, b) => a.position - b.position)
    .map((image) => ({ type: "image", id: image.id, url: image.url }));
}

// Próximo índice sem dar a volta (as setas do teclado param nas pontas).
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index));
}

// Qual slide do carrossel está à vista, a partir da rolagem horizontal.
export function indexFromScroll(scrollLeft: number, slideWidth: number, count: number): number {
  if (!(slideWidth > 0)) return 0;
  return clampIndex(Math.round(scrollLeft / slideWidth), count);
}

export function showsControls(count: number): boolean {
  return count > 1;
}
