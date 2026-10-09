// Formato final das fotos de produto: 9:16 EM PÉ (largura:altura) — o que sai
// do iPhone com o celular em pé e o ajuste "16:9" da câmera (ex.: 4536×8064).
// Espelho de backend/src/lib/photoFormat.ts; o teste do backend
// (tests/photoFormat.test.ts) garante que os dois arquivos dizem o mesmo.
export const PHOTO_ASPECT_WIDTH = 9;
export const PHOTO_ASPECT_HEIGHT = 16;
// Tolerância relativa na proporção para considerar a foto "já em 9:16".
export const PHOTO_ASPECT_TOLERANCE = 0.03;
// Lado maior da imagem exibida.
export const PHOTO_MAX_LONG_SIDE = 1920;
// Tamanho mínimo recomendado.
export const PHOTO_MIN_WIDTH = 720;
export const PHOTO_MIN_HEIGHT = 1280;
// Máximo de fotos por peça (o backend valida; o admin mostra a mensagem).
export const MAX_PHOTOS_PER_PRODUCT = 10;

// Valor do CSS aspect-ratio (sempre em pé, nunca 16:9 deitado).
export const PHOTO_ASPECT_CSS = `${PHOTO_ASPECT_WIDTH} / ${PHOTO_ASPECT_HEIGHT}`;

export const PHOTO_GUIDANCE =
  "Fotografe com o celular em pé e a proporção 16:9 selecionada na câmera, com a peça centralizada e ocupando cerca de dois terços da largura da foto";

export function isPortrait916(width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return false;
  const target = PHOTO_ASPECT_WIDTH / PHOTO_ASPECT_HEIGHT;
  return Math.abs(width / height / target - 1) <= PHOTO_ASPECT_TOLERANCE;
}

export interface PhotoFormatWarning {
  kind: "ratio" | "small";
  message: string;
}

// Avisos (admin) sobre a foto — só informam, nunca bloqueiam o envio.
//  - "ratio": fora de 9:16 (tolerância de 3%); vai aparecer inteira, com fundo desfocado.
//  - "small": menor que 720×1280. Em 9:16 vale a regra literal; em outra
//    proporção compara-se o tamanho que a foto terá dentro do quadro 9:16
//    (só avisa se precisaria ser ampliada para caber).
export function photoFormatWarnings(width: number, height: number): PhotoFormatWarning[] {
  if (!(width > 0) || !(height > 0)) return [];
  const warnings: PhotoFormatWarning[] = [];
  const portrait = isPortrait916(width, height);

  if (!portrait) {
    const orientation = width > height ? "deitada" : "fora de 9:16";
    warnings.push({
      kind: "ratio",
      message: `Foto ${orientation} (${width}×${height} px). Ela vai aparecer inteira, com fundo desfocado em volta. Para o melhor resultado, ${PHOTO_GUIDANCE.charAt(0).toLowerCase()}${PHOTO_GUIDANCE.slice(1)}.`,
    });
  }

  const small = portrait
    ? width < PHOTO_MIN_WIDTH || height < PHOTO_MIN_HEIGHT
    : Math.min(PHOTO_MIN_WIDTH / width, PHOTO_MIN_HEIGHT / height) > 1;
  if (small) {
    warnings.push({
      kind: "small",
      message: `Foto pequena (${width}×${height} px). Recomendado: pelo menos ${PHOTO_MIN_WIDTH}×${PHOTO_MIN_HEIGHT} px. Ela pode ficar sem nitidez no site.`,
    });
  }
  return warnings;
}

export function maxPhotosMessage(): string {
  return `Limite de ${MAX_PHOTOS_PER_PRODUCT} fotos por peça atingido. Apague uma foto antes de adicionar outra.`;
}

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
export const ACCEPTED_PHOTO_TYPES = "image/jpeg,image/png,image/webp";
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

// Rejeita já no navegador o que o servidor não aceita (mensagem em português).
export function photoFileError(file: { name: string; type: string; size: number }): string | null {
  if (HEIC_TYPES.has(file.type.toLowerCase()) || /\.(heic|heif)$/i.test(file.name)) {
    return "Formato HEIC/HEIF não suportado. No iPhone, use Ajustes > Câmera > Formatos > “Mais Compatível” (JPEG), ou exporte a foto como JPEG.";
  }
  if (file.type && !["image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase())) {
    return "Formato não suportado. Envie uma foto em JPEG, PNG ou WebP.";
  }
  if (file.size > MAX_UPLOAD_BYTES) return "Foto grande demais. O limite é 15 MB.";
  return null;
}
