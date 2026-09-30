// Telefone/WhatsApp do checkout aceita dois formatos, livres de máscara fixa:
// brasileiro sem "+" (DDD + 8 ou 9 dígitos, ex: 14988095356) ou internacional
// já completo com "+" (E.164: "+" seguido de 7 a 15 dígitos). Quando já vem
// com "+", o número não é alterado — o usuário já digitou o código do próprio
// país, então só validamos o formato geral em vez de tentar adivinhar.
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return /^\d{7,15}$/.test(digits) ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  return /^\d{10,11}$/.test(digits) ? `+55${digits}` : null;
}

// Filtro leve de digitação (não é máscara de posição fixa): mantém apenas
// dígitos, espaços, parênteses, hífen e um "+" no início — o suficiente para
// não deixar passar letras, mas sem travar o formato internacional.
export function sanitizePhoneInput(raw: string): string {
  const startsWithPlus = raw.trimStart().startsWith("+");
  const rest = raw.replace(/[^\d\s()-]/g, "");
  return startsWithPlus ? `+${rest.trimStart()}` : rest;
}
