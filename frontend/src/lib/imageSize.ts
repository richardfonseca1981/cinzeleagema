// Aviso (admin) para fotos de baixa resolução. Só informa — nunca bloqueia.

// Abaixo disto, no MENOR lado, a foto é considerada pequena.
export const MIN_SIDE_WARNING_PX = 800;
// Tamanho recomendado para o lado MAIOR (só aparece no texto do aviso).
export const RECOMMENDED_LONG_SIDE_PX = 1200;

export function smallImageWarning(width: number, height: number): string | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (Math.min(width, height) >= MIN_SIDE_WARNING_PX) return null;
  return `Foto pequena (${width}×${height} px). Recomendado: pelo menos ${RECOMMENDED_LONG_SIDE_PX} px no lado maior. Ela pode ficar sem nitidez no site.`;
}
