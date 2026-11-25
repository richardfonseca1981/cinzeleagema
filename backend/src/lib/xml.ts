// Escape mínimo de XML 1.0 (cinco entidades), compartilhado entre o sitemap
// público (lib/sitemap.ts) e o feed de produtos (lib/feed/googleFeed.ts) —
// qualquer necessidade além disso (CDATA, por exemplo) é decisão do chamador.
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
