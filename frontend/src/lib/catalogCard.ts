// Razão e encaixe da foto no card do catálogo, num único lugar: para mudar o
// formato dos cards (ex.: 3/4, cover) basta trocar aqui — o layout não muda.
export const CATALOG_CARD = {
  aspectRatio: "9 / 16",
  fit: "contain" as "contain" | "cover",
} as const;
