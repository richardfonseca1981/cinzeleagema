import {
  SPARKLE_COUNT,
  SPARKLE_MAX_OPACITY,
  SPARKLE_MAX_RADIUS,
  SPARKLE_MIN_OPACITY,
  SPARKLE_MIN_RADIUS,
} from "./layout";

export interface Sparkle {
  // Posição fracionária (0..1) dentro do painel — o chamador multiplica pela
  // largura/altura reais na hora de desenhar.
  xFraction: number;
  yFraction: number;
  radius: number;
  opacity: number;
}

// PRNG determinístico (mulberry32) — mesma semente sempre gera a mesma
// sequência, então o padrão de brilhos de uma peça não muda entre gerações
// do catálogo (ver REFERÊNCIA DE FORMATO: "gerados de forma determinística
// pela referência/ID da peça").
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash simples (string -> inteiro 32 bits) só para transformar o id/SKU da
// peça numa semente numérica — não precisa ser criptográfico, só estável.
function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return hash;
}

// Gera os pontos de brilho do painel de uma peça — sempre os mesmos para o
// mesmo `seed` (id da peça), count/raio/opacidade fixos (ver layout.ts).
export function generateSparkles(seed: string): Sparkle[] {
  const random = mulberry32(hashSeed(seed));
  const sparkles: Sparkle[] = [];
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    sparkles.push({
      xFraction: random(),
      yFraction: random(),
      radius: SPARKLE_MIN_RADIUS + random() * (SPARKLE_MAX_RADIUS - SPARKLE_MIN_RADIUS),
      opacity: SPARKLE_MIN_OPACITY + random() * (SPARKLE_MAX_OPACITY - SPARKLE_MIN_OPACITY),
    });
  }
  return sparkles;
}
