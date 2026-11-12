/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WHATSAPP_NUMBER?: string;
  readonly VITE_CONTACT_EMAIL?: string;
  readonly VITE_WHATSAPP_GROUP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
