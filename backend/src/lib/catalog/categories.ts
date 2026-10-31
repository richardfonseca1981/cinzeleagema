import type { CatalogLanguage } from "./content";

// Ordem fixa dos divisores de categoria no catálogo em PDF — pedida
// explicitamente (não vem de Category.position, que é a ordem usada no
// admin/site público). Comparação por nome normalizado (sem acento,
// minúsculo) para não depender de grafia exata (ex.: "Acessórios" no banco
// vs. "Acessorios" como foi escrito ao pedir esta ordem).
//
// FRÁGIL POR DESIGN: uma categoria nova cadastrada no admin que não conste
// aqui cai no grupo "outras" (ver sortProductsIntoCategoryGroups), no fim,
// na ordem em que aparece — funciona, mas não ganha a posição fixa até
// alguém atualizar esta lista.
const FIXED_CATEGORY_ORDER = ["pedras brutas", "pedras polidas", "big", "formas", "homedecor", "acessorios"];

// Mesmas traduções já usadas no site público (ver
// frontend/src/locales/en.json "categoryNames") — reaproveitadas aqui para o
// catálogo em EN não divergir do nome mostrado no site. Chave = nome exato
// gravado no banco (Category.name).
const CATEGORY_NAME_EN: Record<string, string> = {
  "Pedras Brutas": "Rough Stones",
  "Pedras Polidas": "Polished Stones",
  Big: "Big Pieces",
  Homedecor: "Home Decor",
  Acessorios: "Accessories",
  Formas: "Shapes",
};

const DIACRITIC_MARKS = new RegExp("[̀-ͯ]", "g");

function normalizeCategoryName(value: string): string {
  return value.normalize("NFD").replace(DIACRITIC_MARKS, "").toLowerCase().trim();
}

export function localizeCategoryName(name: string, language: CatalogLanguage): string {
  if (language === "en" && CATEGORY_NAME_EN[name]) return CATEGORY_NAME_EN[name];
  return name;
}

export interface CategoryGroup<T> {
  // null = grupo das peças sem categoria (ver REGRAS: Product.categoryId
  // nullable) — sempre por último, só aparece se não estiver vazio.
  categoryName: string | null;
  items: T[];
}

// Agrupa peças (JÁ na ordem de sortOrder — ver DEFAULT_ORDER_BY) por
// categoria, na ORDEM FIXA pedida, preservando o sortOrder relativo dentro
// de cada grupo (partição estável, não reordena os itens). Categorias fora
// da lista fixa entram depois das conhecidas, na ordem em que aparecem;
// peças sem categoria sempre por último. Grupos vazios não aparecem.
export function groupProductsByCategory<T extends { categoryName: string | null }>(products: readonly T[]): CategoryGroup<T>[] {
  // Nomes reais (como gravados no banco), na ordem de primeira aparição —
  // usado só para achar, para cada posição da ordem fixa, o nome real
  // correspondente (ou não, se a categoria não tiver peça nenhuma aqui).
  const seenNames: string[] = [];
  for (const product of products) {
    if (product.categoryName !== null && !seenNames.includes(product.categoryName)) {
      seenNames.push(product.categoryName);
    }
  }
  const unknown = seenNames.filter((name) => !FIXED_CATEGORY_ORDER.includes(normalizeCategoryName(name)));

  // Nomes reais na ordem final: categorias conhecidas (ordem fixa) primeiro,
  // depois as desconhecidas (ordem de aparição), "sem categoria" por último.
  const orderedCategoryNames: string[] = [];
  for (const fixed of FIXED_CATEGORY_ORDER) {
    const match = seenNames.find((name) => normalizeCategoryName(name) === fixed);
    if (match) orderedCategoryNames.push(match);
  }
  for (const name of unknown) orderedCategoryNames.push(name);

  const groups: CategoryGroup<T>[] = orderedCategoryNames.map((categoryName) => ({
    categoryName,
    items: products.filter((p) => p.categoryName === categoryName),
  }));

  const uncategorized = products.filter((p) => p.categoryName === null);
  if (uncategorized.length > 0) groups.push({ categoryName: null, items: uncategorized });

  return groups.filter((group) => group.items.length > 0);
}
