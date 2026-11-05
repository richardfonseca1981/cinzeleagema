import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { analyzeBackgroundTrim, processCatalogPhoto } from "../src/lib/catalog/photoLayer";

// Imagem sintética: fundo liso (cor uniforme) ocupando o topo e a base, com
// um "objeto" ocupando uma faixa — com textura real dentro da faixa do
// objeto (listras verticais de alto contraste, não ruído aleatório i.i.d. e
// não um bloco de cor chapada). Ruído aleatório pixel a pixel se cancela
// quase todo no redimensionamento para a largura de análise (médias de ~5
// colunas por pixel do grid, pela lei dos grandes números) — por isso as
// fotos reais calibradas (ver relatório: desvio padrão de linha ~8-77 no
// conteúdo contra ~1-2.5 no fundo) foram usadas como referência de amplitude
// real, não um valor arbitrário. Listras (período bem maior que a janela do
// filtro de redimensionamento) sobrevivem à média sem se cancelar, dando um
// desvio padrão de linha alto e estável — mais parecido com a textura/
// reflexo real de uma pedra do que ruído puro, e sem a fragilidade de um
// bloco de cor perfeitamente uniforme (indistinguível de fundo por qualquer
// detector baseado em variação).
async function syntheticBackgroundPlusObject(options: {
  width?: number;
  height?: number;
  objectStart: number; // fração 0-1 de onde o objeto começa
  objectEnd: number; // fração 0-1 de onde o objeto termina
  backgroundColor?: { r: number; g: number; b: number };
  objectColor?: { r: number; g: number; b: number };
}): Promise<Buffer> {
  const width = options.width ?? 300;
  const height = options.height ?? 1000;
  const bg = options.backgroundColor ?? { r: 230, g: 230, b: 225 };
  const obj = options.objectColor ?? { r: 40, g: 90, b: 60 };
  const objContrast = { r: 255 - obj.r, g: 255 - obj.g, b: 255 - obj.b };

  const objTop = Math.round(height * options.objectStart);
  const objHeight = Math.round(height * (options.objectEnd - options.objectStart));

  const base = sharp({ create: { width, height, channels: 3, background: bg } });

  const stripePeriod = 20;
  const objectPixels = Buffer.alloc(width * objHeight * 3);
  for (let y = 0; y < objHeight; y++) {
    for (let x = 0; x < width; x++) {
      const stripe = Math.floor(x / stripePeriod) % 2 === 0 ? obj : objContrast;
      const i = (y * width + x) * 3;
      objectPixels[i] = stripe.r;
      objectPixels[i + 1] = stripe.g;
      objectPixels[i + 2] = stripe.b;
    }
  }
  // .png() explícito: sem um formato de saída, sharp devolve pixels RAW
  // (bytes crus WxHx3), que `.composite()` não consegue decodificar como
  // entrada (precisa de um formato reconhecível, ex. PNG).
  const objectBuffer = await sharp(objectPixels, { raw: { width, height: objHeight, channels: 3 } }).png().toBuffer();

  return base
    .composite([{ input: objectBuffer, left: 0, top: objTop }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

// PRNG determinístico (mulberry32) — um teste não pode depender de
// Math.random(): a tolerância abaixo (3%) cobre a atenuação ESPERADA do
// ruído pelo redimensionamento, mas ruído verdadeiramente aleatório pode,
// por sorte, produzir uma sequência com variância local baixa o bastante
// pra furar qualquer tolerância fixa de vez em quando — foi exatamente o
// que aconteceu (falha intermitente observada em CI). Com semente fixa, o
// resultado é sempre o mesmo, então a tolerância escolhida continua válida
// para sempre, em vez de "válida na maioria das vezes".
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Imagem sintética toda ruidosa (ruído aleatório forte em todos os pixels)
// — nenhuma faixa de fundo uniforme detectável.
async function syntheticNoisyPhoto(width = 300, height = 1000): Promise<Buffer> {
  const random = mulberry32(20261105);
  const size = width * height * 3;
  const data = Buffer.alloc(size);
  for (let i = 0; i < size; i++) data[i] = Math.floor(random() * 256);
  return sharp(data, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

describe("analyzeBackgroundTrim", () => {
  it("fundo liso + objeto centralizado: corta topo e base, sem passar do início/fim do objeto", async () => {
    const raw = await syntheticBackgroundPlusObject({ objectStart: 0.3, objectEnd: 0.7 });
    const trim = await analyzeBackgroundTrim(raw);

    expect(trim.topFraction).toBeGreaterThan(0);
    expect(trim.bottomFraction).toBeGreaterThan(0);
    // Nunca corta até ultrapassar o início real do objeto (0.3) ou o fim
    // (1 - 0.7 = 0.3 de fundo na base) — sempre um pouco MENOS que isso
    // (a folga de ~3% fica por conta do objeto, não cortada).
    expect(trim.topFraction).toBeLessThan(0.3);
    expect(trim.bottomFraction).toBeLessThan(0.3);
    // Fundo disponível de cada lado é 30% da altura — o limite de 30% TOTAL
    // (ver TRIM_MAX_TOTAL_FRACTION) entra em ação aqui (30%+30%=60%>30%) e
    // reduz os dois proporcionalmente para a soma caber no limite — por
    // isso ~0.15 cada (metade do que seria sem o limite), não os ~0.27
    // "ideais" (0.3 menos a folga de 3%).
    expect(trim.topFraction).toBeGreaterThan(0.1);
    expect(trim.bottomFraction).toBeGreaterThan(0.1);
    expect(trim.topFraction + trim.bottomFraction).toBeLessThanOrEqual(0.3 + 0.01);
  });

  it("objeto encostado no topo: não corta nada do topo", async () => {
    const raw = await syntheticBackgroundPlusObject({ objectStart: 0, objectEnd: 0.6 });
    const trim = await analyzeBackgroundTrim(raw);

    expect(trim.topFraction).toBe(0);
    // Base ainda tem fundo real (0.4 da altura) — deve cortar algo ali.
    expect(trim.bottomFraction).toBeGreaterThan(0);
  });

  it("objeto ocupa a foto inteira (sem fundo em lugar nenhum): não corta nada", async () => {
    const raw = await syntheticBackgroundPlusObject({ objectStart: 0, objectEnd: 1 });
    const trim = await analyzeBackgroundTrim(raw);

    expect(trim.topFraction).toBe(0);
    expect(trim.bottomFraction).toBe(0);
  });

  it("foto toda ruidosa (sem faixa de fundo clara): análise não confiável, não corta nada (ou quase nada)", async () => {
    const raw = await syntheticNoisyPhoto();
    const trim = await analyzeBackgroundTrim(raw);

    // Ruído puro e independente por pixel some bastante ao reamostrar para
    // o grid de análise (médias de blocos reduzem a variância) — por isso
    // tolera uma fração residual ínfima em vez de exigir exatamente 0 (não
    // determinístico pixel a pixel), mas nunca uma fração substancial.
    expect(trim.topFraction).toBeLessThanOrEqual(0.03);
    expect(trim.bottomFraction).toBeLessThanOrEqual(0.03);
  });

  it("nunca corta mais que 30% da altura no total, mesmo com fundo enorme", async () => {
    // Objeto bem pequeno no meio — fundo é 80% da altura (muito mais que o
    // limite de 30%).
    const raw = await syntheticBackgroundPlusObject({ objectStart: 0.45, objectEnd: 0.55 });
    const trim = await analyzeBackgroundTrim(raw);

    expect(trim.topFraction + trim.bottomFraction).toBeLessThanOrEqual(0.3 + 0.01);
  });

  it("fundo só no topo (objeto encostado na base): corta só o topo", async () => {
    const raw = await syntheticBackgroundPlusObject({ objectStart: 0.25, objectEnd: 1 });
    const trim = await analyzeBackgroundTrim(raw);

    expect(trim.topFraction).toBeGreaterThan(0);
    expect(trim.bottomFraction).toBe(0);
  });
});

describe("processCatalogPhoto com photoFit 'trim'", () => {
  it("gera um JPEG válido e devolve as frações de corte usadas", async () => {
    const raw = await syntheticBackgroundPlusObject({ objectStart: 0.3, objectEnd: 0.7 });
    const { composite, trim } = await processCatalogPhoto(raw, { quality: "light", photoAreaHeight: 500, photoFit: "trim" });

    expect(composite.subarray(0, 2).toString("hex")).toBe("ffd8"); // marcador JPEG
    expect(trim.topFraction).toBeGreaterThan(0);
    expect(trim.bottomFraction).toBeGreaterThan(0);
  });

  it("com foto ruidosa, trim não corta nada (ou quase nada) — equivalente a 'contain'", async () => {
    const raw = await syntheticNoisyPhoto();
    const { trim } = await processCatalogPhoto(raw, { quality: "light", photoAreaHeight: 500, photoFit: "trim" });

    expect(trim.topFraction).toBeLessThanOrEqual(0.03);
    expect(trim.bottomFraction).toBeLessThanOrEqual(0.03);
  });
});
