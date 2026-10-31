import path from "path";

// backend/assets/fonts NÃO é compilado pelo tsc (só .ts em src/ vira dist/) —
// por isso o caminho é resolvido a partir de __dirname em vez de importado
// como módulo. src/lib/catalog e dist/lib/catalog ficam na MESMA profundidade
// relativa a backend/ (dois níveis abaixo), então o mesmo "../../../assets"
// funciona tanto rodando com ts-node/tsx (src/lib/catalog/fonts.ts) quanto
// no build de produção (dist/lib/catalog/fonts.js) — provado rodando
// `npm run build` e importando o arquivo compilado (ver generateCatalogPdf
// e o build real antes de considerar esta etapa concluída).
const FONTS_DIR = path.resolve(__dirname, "../../../assets/fonts");

export const CATALOG_FONTS = {
  cinzelRegular: path.join(FONTS_DIR, "Cinzel-Regular.ttf"),
  cinzelBold: path.join(FONTS_DIR, "Cinzel-Bold.ttf"),
  openSansRegular: path.join(FONTS_DIR, "OpenSans-Regular.ttf"),
  openSansItalic: path.join(FONTS_DIR, "OpenSans-Italic.ttf"),
  openSansBoldItalic: path.join(FONTS_DIR, "OpenSans-BoldItalic.ttf"),
} as const;

export type CatalogFontKey = keyof typeof CATALOG_FONTS;
