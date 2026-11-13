import { slugify } from "./productSlug";

// Slug público de produto: SEMPRE calculado na hora a partir do nome ATUAL +
// um sufixo curto e estável do id (cuid, nunca muda) — nunca gravado no
// banco. Diferente de Product.slug (gerado uma vez na criação, nunca
// atualizado — ver productSlug.ts), este slug muda se o nome mudar, então a
// rota pública faz lookup pelo SUFIXO (ver by-slug em product.routes.ts) e
// redireciona para o slug atual quando o nome mudou. Renomear a peça nunca
// quebra o link, porque o sufixo (derivado só do id) é o único dado usado na
// busca.
export const SLUG_SUFFIX_LENGTH = 6;

// cuid (Product.id) é só minúsculas/dígitos, então os últimos N caracteres
// já servem como sufixo — sem necessidade de hash extra. Para uma peça só
// (poucas centenas/milhares no catálogo, nunca milhões), a chance de duas
// peças compartilharem os mesmos 6 caracteres finais do id é desprezível;
// colisão (rara) é tratada em pickProductBySuffixMatch.
export function idSuffix(id: string, length: number = SLUG_SUFFIX_LENGTH): string {
  return id.slice(-length).toLowerCase();
}

// Extrai o sufixo de QUALQUER parâmetro de URL de produto: tanto o formato
// novo ("ametista-bruta-a1b2c3", sufixo = "a1b2c3") quanto a URL antiga, que
// era o cuid puro (ex. "cm3x9f8s9...xyzabc", sufixo = "xyzabc" = os mesmos 6
// caracteres finais do próprio id). As duas formas usam a MESMA extração —
// por isso uma única rota/lookup atende old-id e slug novo sem detectar
// formato.
export function extractIdSuffix(param: string, length: number = SLUG_SUFFIX_LENGTH): string {
  return param.slice(-length).toLowerCase();
}

// Slug público = nome atual (slugify) + sufixo do id. Peça sem nome usa
// "peca" como base (sem necessidade do sufixo aleatório de baseSlugFor, já
// que o sufixo do id aqui garante exclusividade).
export function buildPublicSlug(name: string | null | undefined, id: string): string {
  const base = slugify((name ?? "").trim()) || "peca";
  return `${base}-${idSuffix(id)}`;
}

// Desempate quando mais de uma peça compartilha o mesmo sufixo (colisão
// extremamente rara, ver idSuffix): prefere a peça cujo slug público atual
// bate exatamente com o que foi pedido na URL; sem nenhuma correspondência
// exata, cai para a primeira por id (ordem determinística, nunca aleatória).
export function pickProductBySuffixMatch<T extends { id: string; name: string | null }>(
  candidates: T[],
  requestedSlug: string
): T | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const normalizedRequested = requestedSlug.toLowerCase();
  const exact = candidates.find((c) => buildPublicSlug(c.name, c.id) === normalizedRequested);
  if (exact) return exact;

  return [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}
