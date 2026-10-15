import path from "path";
import fs from "fs/promises";
import sharp from "sharp";

// Gera, UMA vez, o PNG pequeno do logo embutido no export de produtos
// (productExport.routes.ts) a partir do logo oficial do site (frontend/src/
// assets/logo-topo.webp — mesmo arquivo usado no AdminLayout/Login). exceljs
// não lê WebP, só PNG/JPEG — por isso a conversão aqui, e não em runtime: o
// build do Railway só compila TS, não tem acesso ao diretório do frontend.
// Rodar de novo só se o logo oficial mudar: `npm run generate:export-logo -w backend`.
const SOURCE = path.resolve(__dirname, "../../../frontend/src/assets/logo-topo.webp");
const OUTPUT = path.resolve(__dirname, "../lib/exportLogo.ts");
const TARGET_WIDTH = 240; // ver backend/src/lib/exportLogo.ts para a proporção resultante

async function main() {
  const png = await sharp(SOURCE).resize({ width: TARGET_WIDTH }).png().toBuffer();
  const metadata = await sharp(png).metadata();
  const base64 = png.toString("base64");

  const content = `// Gerado por backend/src/scripts/generateExportLogo.ts — NÃO EDITAR À MÃO.
// Fonte: frontend/src/assets/logo-topo.webp, redimensionado para ${TARGET_WIDTH}px
// de largura e convertido para PNG (exceljs não lê WebP). Reexecute o script
// se o logo oficial mudar.
export const EXPORT_LOGO_PNG_BASE64 =
  "${base64}";

export const EXPORT_LOGO_WIDTH = ${metadata.width};
export const EXPORT_LOGO_HEIGHT = ${metadata.height};
`;

  await fs.writeFile(OUTPUT, content, "utf-8");
  console.log(`Logo gerado em ${OUTPUT} (${metadata.width}x${metadata.height}px, ${(base64.length / 1024).toFixed(1)} KB em base64).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
