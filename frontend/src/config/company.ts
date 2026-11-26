// Identificação pública da empresa (Decreto 7.962/2013, art. 2º — comércio
// eletrônico deve exibir nome/razão social, CNPJ e endereço — e exigência
// equivalente do Google Merchant Center). Dados públicos de propósito: não
// são segredo, não vão para variável de ambiente, e ficam num módulo único
// para nunca serem digitados de novo em cada lugar que precisar deles
// (rodapé hoje; JSON-LD/Política de Privacidade podem reaproveitar depois).
export const COMPANY = {
  legalName: "Cinzel e a Gema Comércio e Representação LTDA",
  cnpj: "68.854.699/0001-90",
  address: "Avenida Jose Ilio Veronez, 257, Setor Leste Sala 01, Bairro: Parque Industrial Toufik Rachid Razuk, CEP: 17284-634, Pederneiras/SP",
} as const;
