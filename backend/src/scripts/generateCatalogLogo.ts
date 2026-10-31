import path from "path";
import fs from "fs/promises";
import sharp from "sharp";

// Gera, UMA vez, o PNG do logo embutido no catálogo em PDF (ver
// lib/catalog/pdfPages.ts) a partir do logo oficial do site
// (frontend/src/assets/logo-topo.webp — mesmo arquivo usado no export Excel,
// ver generateExportLogo.ts). Diferente do logo do Excel: aqui o fundo
// precisa ser TRANSPARENTE — o arquivo original tem um fundo sólido quase
// preto (RGB ~0,2,12) só perto do navy da marca (#010B1A), não idêntico, o
// que deixava um retângulo visível na capa do catálogo. Chroma-key: pixels
// perto da cor de fundo viram transparentes (o chamador compõe sobre o navy
// real), com uma faixa de transição suave para a borda do logo não ficar
// serrilhada.
//
// Rodar de novo só se o logo oficial mudar: `npm run generate:catalog-logo -w backend`.
const SOURCE = path.resolve(__dirname, "../../../frontend/src/assets/logo-topo.webp");
const OUTPUT = path.resolve(__dirname, "../lib/catalog/logo.ts");

const BACKGROUND_RGB = [0, 2, 12] as const;
// Distância euclidiana (0-441) ao fundo: abaixo de LOW = 100% transparente;
// acima de HIGH = 100% opaco; entre os dois, transição linear (antialiasing
// da borda do logo).
const LOW = 18;
const HIGH = 55;

async function main() {
  const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const dist = Math.sqrt((r - BACKGROUND_RGB[0]) ** 2 + (g - BACKGROUND_RGB[1]) ** 2 + (b - BACKGROUND_RGB[2]) ** 2);
    const alpha = dist <= LOW ? 0 : dist >= HIGH ? 255 : Math.round(((dist - LOW) / (HIGH - LOW)) * 255);
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = alpha;
  }

  const png = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const base64 = png.toString("base64");

  const content = `// Gerado por backend/src/scripts/generateCatalogLogo.ts — NÃO EDITAR À MÃO.
// Fonte: frontend/src/assets/logo-topo.webp, com o fundo removido por
// chroma-key (fica transparente — ver o script para o motivo). Reexecute o
// script se o logo oficial mudar.
export const CATALOG_LOGO_PNG_BASE64 =
  "${base64}";

export const CATALOG_LOGO_WIDTH = ${width};
export const CATALOG_LOGO_HEIGHT = ${height};
`;

  await fs.writeFile(OUTPUT, content, "utf-8");
  console.log(`Logo do catálogo gerado em ${OUTPUT} (${width}x${height}px, ${(base64.length / 1024).toFixed(1)} KB em base64).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
