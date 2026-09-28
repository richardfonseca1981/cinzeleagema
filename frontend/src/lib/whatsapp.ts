const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER;

export const WHATSAPP_HREF = WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}` : null;
