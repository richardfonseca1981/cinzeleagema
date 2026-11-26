// Saneia o termo de busca do catálogo ANTES de reportar ao GA4 (evento
// "search", ver pages/Catalog.tsx) — a busca em si nunca usa o valor
// saneado, só o parâmetro enviado ao Google. Ver CONTEXT.md "LGPD —
// saneamento do search_term".
const MAX_LENGTH = 100;

// Heurística única (contagem de dígitos) cobre telefone (8+), CPF (11) e
// CNPJ (14) ao mesmo tempo — basta remover tudo que não é dígito (cobre
// espaço, traço, parênteses, ponto e barra, formatos comuns dos três) e
// contar o que sobra. Pode gerar falso positivo em busca por código/SKU
// numérico longo — aceito de propósito: o risco de vazar um dado pessoal
// pesa mais que perder um termo de busca no relatório do GA4.
function looksLikePersonalData(value: string): boolean {
  if (value.includes("@")) return true;
  const digitsOnly = value.replace(/\D/g, "");
  return digitsOnly.length >= 8;
}

export function sanitizeSearchTerm(raw: string): string {
  const trimmed = raw.trim();
  if (looksLikePersonalData(trimmed)) return "[redacted]";
  return trimmed.toLowerCase().slice(0, MAX_LENGTH);
}
