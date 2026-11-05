import { prisma } from "../lib/prisma";

// Script de investigação SOMENTE LEITURA — não altera nenhuma peça.
// Verifica quantas peças têm nome duplicado (ex.: "X X", "X - X") em
// name/nameEn/identificationPt/identificationEn, e mostra exemplos reais.

const DIACRITIC_MARKS = new RegExp("[̀-ͯ]", "g");
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITIC_MARKS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Detecta "A A" ou "A - A" (mesma sequência repetida, ignorando acento/maiúscula)
function findRepeatedSequence(text: string): string | null {
  const norm = normalize(text);
  const n = norm.length;
  for (let len = Math.floor(n / 2); len >= 3; len--) {
    for (let start = 0; start + len * 2 <= n; start++) {
      const a = norm.slice(start, start + len);
      const rest = norm.slice(start + len);
      const sepMatch = rest.match(/^(\s*-?\s*)/);
      const sep = sepMatch ? sepMatch[0] : "";
      const b = rest.slice(sep.length, sep.length + len);
      if (a === b && a.trim().length >= 3) {
        return text;
      }
    }
  }
  return null;
}

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, sku: true, name: true, nameEn: true, identificationPt: true, identificationEn: true },
  });

  const fields: Array<"name" | "nameEn" | "identificationPt" | "identificationEn"> = [
    "name",
    "nameEn",
    "identificationPt",
    "identificationEn",
  ];

  const affected = new Map<string, { sku: string | null; field: string; value: string }[]>();

  for (const p of products) {
    for (const field of fields) {
      const value = p[field];
      if (!value) continue;
      const hit = findRepeatedSequence(value);
      if (hit) {
        const list = affected.get(p.id) ?? [];
        list.push({ sku: p.sku, field, value });
        affected.set(p.id, list);
      }
    }
  }

  console.log(`Total de peças no banco: ${products.length}`);
  console.log(`Peças com algum campo de nome duplicado: ${affected.size}`);
  console.log(`\nExemplos (até 10):`);
  let shown = 0;
  for (const [id, hits] of affected) {
    if (shown >= 10) break;
    for (const hit of hits) {
      console.log(`  - id=${id} sku=${hit.sku ?? "(sem sku)"} campo=${hit.field}: "${hit.value}"`);
    }
    shown++;
  }

  // Também verifica: identificationPt/En começando com o mesmo texto de name/nameEn
  // (duplicação cruzada entre nome cadastrado e identificação da IA).
  let crossDup = 0;
  const crossExamples: string[] = [];
  for (const p of products) {
    if (p.name && p.identificationPt) {
      const n = normalize(p.name);
      const i = normalize(p.identificationPt);
      if (n.length >= 3 && i.startsWith(n)) {
        crossDup++;
        if (crossExamples.length < 5) crossExamples.push(`id=${p.id} sku=${p.sku ?? "(sem sku)"} name="${p.name}" identificationPt="${p.identificationPt}"`);
      }
    }
  }
  console.log(`\nPeças onde identificationPt começa com o name cadastrado: ${crossDup}`);
  for (const ex of crossExamples) console.log(`  - ${ex}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
