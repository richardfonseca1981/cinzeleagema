// Cálculo (puro) do tamanho em que a foto do produto é exibida dentro da
// moldura: a foto fica INTEIRA (contain), nunca é esticada e nunca é ampliada
// além de MAX_UPSCALE vezes o tamanho original em px CSS — fotos pequenas
// ficam menores que a moldura (o resto é preenchido pelo fundo desfocado)
// em vez de pixelar.

// Limite de ampliação sobre o tamanho natural da foto (px CSS).
export const MAX_UPSCALE = 1.5;

export interface Size {
  width: number;
  height: number;
}

export function computeDisplaySize(natural: Size, frame: Size, maxUpscale: number = MAX_UPSCALE): Size & { scale: number } {
  if (natural.width <= 0 || natural.height <= 0 || frame.width <= 0 || frame.height <= 0) {
    return { width: Math.max(0, frame.width), height: Math.max(0, frame.height), scale: 1 };
  }

  const containScale = Math.min(frame.width / natural.width, frame.height / natural.height);
  const scale = Math.min(containScale, maxUpscale);

  return {
    width: Math.round(natural.width * scale),
    height: Math.round(natural.height * scale),
    scale,
  };
}
