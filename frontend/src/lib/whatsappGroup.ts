// Link do grupo de WhatsApp de ofertas exclusivas. Valor padrão no código
// (sem os parâmetros de rastreio ?s=cl&p=i&...) para funcionar mesmo sem a
// variável configurada na Vercel; VITE_WHATSAPP_GROUP_URL, quando definida,
// tem prioridade.
const DEFAULT_WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/KN60WlSdW9K9yQNLna5kHy";

export const WHATSAPP_GROUP_URL = import.meta.env.VITE_WHATSAPP_GROUP_URL || DEFAULT_WHATSAPP_GROUP_URL;
