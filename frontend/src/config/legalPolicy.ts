// Valores confirmados pelo cliente em 2026-11-26 para as páginas legais
// (Política de Troca e Devolução, Termos de Venda) — módulo único para nunca
// digitar esses números/frases de novo em cada texto. serviceHours e
// installments variam por idioma (são frases, não dado bruto como
// config/company.ts), por isso ficam como objeto por idioma (mesmas chaves
// de SupportedLanguage em i18n.ts); os prazos em dias são os mesmos nos dois
// idiomas, só o texto ao redor muda.
export const LEGAL_POLICY = {
  serviceHours: {
    "pt-BR": "segunda a sexta, das 9h às 18h",
    en: "Monday to Friday, 9 a.m. to 6 p.m.",
  },
  installments: {
    "pt-BR": "em até 12 vezes, com taxas informadas antes da confirmação do pedido",
    en: "up to 12 installments, with fees informed before the order is confirmed",
  },
  withdrawalDays: 7,
  defectNoticeDays: 90,
  voluntaryExchangeDays: 30,
  responseBusinessDays: 3,
  defectAnalysisBusinessDays: 3,
  refundBusinessDays: 3,
  shippingBusinessDays: 3,
} as const;
