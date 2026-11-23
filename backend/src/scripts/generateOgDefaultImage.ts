import path from "path";
import sharp from "sharp";

// Gera, UMA vez, o og:image estático (1200x630, paisagem) usado por
// Home e /catalogo (ver lib/seo/meta.ts buildHomeMeta/buildCatalogMeta) —
// as duas únicas páginas sem peça específica, então sem derivado por
// produto (ver lib/seo/ogImage.ts, só para produto). Fonte: o mesmo
// logo-topo.webp já usado no AdminLayout/Login/export de produtos (ver
// generateExportLogo.ts) — fundo #00020C sólido (cor real do arquivo,
// amostrada do canto), sem textura extra: o logo já tem o fundo certo, só
// precisa de "letterboxing" até a proporção 1.91:1 do og:image.
// Rodar de novo só se o logo oficial mudar: `npm run generate:og-default -w backend`.
const SOURCE = path.resolve(__dirname, "../../../frontend/src/assets/logo-topo.webp");
const OUTPUT = path.resolve(__dirname, "../../../frontend/public/og-default.jpg");
const BRAND_BACKGROUND = { r: 0, g: 2, b: 12 }; // #00020C — mesma cor do PublicHeader/AdminLayout

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 630;
const JPEG_QUALITY = 90;

async function main() {
  const logo = await sharp(SOURCE)
    .resize({ height: Math.round(OUTPUT_HEIGHT * 0.8), fit: "inside" })
    .toBuffer();
  const logoMeta = await sharp(logo).metadata();
  const left = Math.round(((logoMeta.width ?? 0) > OUTPUT_WIDTH ? 0 : OUTPUT_WIDTH - (logoMeta.width ?? 0)) / 2);
  const top = Math.round((OUTPUT_HEIGHT - (logoMeta.height ?? 0)) / 2);

  const out = await sharp({
    create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3, background: BRAND_BACKGROUND },
  })
    .composite([{ input: logo, left, top }])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  await sharp(out).toFile(OUTPUT);
  console.log(`og-default.jpg gerado em ${OUTPUT} (${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}px, ${(out.length / 1024).toFixed(1)} KB).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
