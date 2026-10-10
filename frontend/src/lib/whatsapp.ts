const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER;

export const WHATSAPP_HREF = WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}` : null;

// Link de WhatsApp pré-preenchido para consultar o valor de uma peça sem
// preço cadastrado (ver lib/format.ts canAddToCart) — mesmo guard de número
// ausente do WHATSAPP_HREF acima (null em vez de link quebrado).
export function buildPriceInquiryHref(message: string): string | null {
  return WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}` : null;
}
