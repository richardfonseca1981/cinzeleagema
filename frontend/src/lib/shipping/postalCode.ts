// CEP brasileiro: máscara 00000-000 e validação de 8 dígitos.
export const BR_POSTAL_CODE_LENGTH = 8;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

// Aceita qualquer entrada (colar "01.001-000", digitar, etc.) e devolve a máscara.
export function maskBrazilianPostalCode(raw: string): string {
  const digits = digitsOnly(raw).slice(0, BR_POSTAL_CODE_LENGTH);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function isCompleteBrazilianPostalCode(value: string): boolean {
  return digitsOnly(value).length === BR_POSTAL_CODE_LENGTH;
}

// Código postal de outros países: texto livre, aparado e limitado.
export const MAX_FOREIGN_POSTAL_CODE_LENGTH = 20;

export function sanitizeForeignPostalCode(raw: string): string {
  return raw.slice(0, MAX_FOREIGN_POSTAL_CODE_LENGTH);
}

// Como o código aparece na mensagem/resumo.
export function formatPostalCode(country: string, postalCode: string): string {
  if (country === "BR") return maskBrazilianPostalCode(postalCode);
  return postalCode.trim();
}
