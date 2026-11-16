// Sanitização defensiva do texto livre (`description`/`identificationPt`)
// que entra na descrição estendida do anúncio do Mercado Livre (ver
// descriptionBuilder.ts) — o Mercado Livre proíbe contato fora da
// plataforma (URL, e-mail, usuário de rede social, WhatsApp/telefone) e o
// nome da loja; cadastro antigo às vezes carrega algum desses por engano
// (herdado do texto do site público). Texto FIXO (ML_CURATION_TEXT, linha
// de peso/dimensão/material) nunca passa por aqui — só o corpo vindo do
// banco.
//
// Risco central (por isso cada regra abaixo documenta a forma exata): uma
// regra agressiva demais apaga medida ("45x18x20 cm"), peso ("1.696 g"),
// preço ou SKU/lote por engano. Cada padrão de telefone exige o FORMATO
// completo de DDD (2 dígitos) + número local (8-9 dígitos) — um SKU/lote
// com poucos dígitos ou sem esse formato nunca bate.

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// http(s)://..., www.algo..., ou domínio nu com TLD conhecido (ex.:
// "cinzeleagema.com.br", "concorrente.com") + path opcional. Lista de TLD
// fechada DE PROPÓSITO: qualquer TLD fora dela não é removido (prefere
// falso negativo a apagar algo que não é URL — um número decimal nunca tem
// letra depois do ponto, então nunca colide com esta lista).
const URL_PATTERN =
  /\b(?:https?:\/\/\S+|www\.\S+|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com\.br|com|net\.br|net|org\.br|org|shop|loja|info)(?:\/\S*)?)/gi;

const EMAIL_PATTERN = /\b[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}\b/gi;

// "@usuario" de rede social — roda DEPOIS do e-mail já ter sido removido
// (senão bateria só a metade "@dominio" de um e-mail já tratado por regra
// própria, perdendo o restante do token).
const MENTION_PATTERN = /@[a-z0-9_.]{2,}/gi;

// Gatilho (whatsapp/zap/telefone/fone/celular) + número próximo (mesma
// linha, até ~40 chars de distância em qualquer direção) — remove o trecho
// inteiro (gatilho + número), nunca só o número solto por uma palavra que
// nem sempre indica contato telefônico (ex. "celular" sem número nenhum ao
// lado não é removido por esta regra).
const CONTACT_TRIGGER = "whats\\s*app|wpp|zap|telefone|fone|celular";
const PHONE_DIGITS = "\\+?55[\\s.-]?\\(?\\d{2}\\)?[\\s.-]?9?\\d{4}[\\s.-]?\\d{4}|\\(?\\d{2}\\)?[\\s.-]?9?\\d{4}[\\s.-]?\\d{4}";
const TRIGGER_THEN_PHONE = new RegExp(`\\b(?:${CONTACT_TRIGGER})\\b[^\\n]{0,40}?(?:${PHONE_DIGITS})`, "gi");
const PHONE_THEN_TRIGGER = new RegExp(`(?:${PHONE_DIGITS})[^\\n]{0,40}?\\b(?:${CONTACT_TRIGGER})\\b`, "gi");

// Número com FORMATO de telefone brasileiro (DDD + número local), mesmo
// sem nenhuma palavra-gatilho ao lado — exige DDD de 2 dígitos seguido de
// número local de 8-9 dígitos (celular sempre começa em 9), com os
// separadores usuais (espaço, parênteses, hífen/ponto) ou nenhum. Medidas
// ("45x18x20 cm"), peso ("1.696 g" — só 3-4 dígitos corridos) e preço nunca
// têm essa forma; SKU/lote só colide se alguém digitar, por acaso, o
// mesmo formato de telefone completo — risco aceito e coberto por teste.
// Sem \b no início: o prefixo (DDI opcional + "(" do DDD) começa com
// caractere não-alfanumérico, então uma fronteira de palavra ali nem
// sempre existe (ex.: espaço seguido de "(" — os dois são não-palavra,
// \b não dispara) mesmo em um número de telefone real.
const BARE_PHONE_PATTERN = /(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9\d{3,4}[\s.-]?\d{4}\b/g;

const STORE_NAME_TERMS = ["o cinzel e a gema", "cinzel e a gema", "cinzel"];

function stripStoreName(text: string): string {
  let result = text;
  for (const term of STORE_NAME_TERMS) {
    const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    result = result.replace(re, "");
  }
  return result;
}

// Colapsa espaços múltiplos DENTRO de cada linha e remove linhas que
// sobraram vazias (rastro de uma remoção acima) — nunca junta linhas
// diferentes nem converte quebra de linha em espaço (ver ponto 3 do pedido:
// texto puro, quebras preservadas).
function cleanupLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

export function sanitizeMercadoLivreDescriptionText(text: string): string {
  let result = text;
  // E-mail ANTES de URL: o domínio nu do e-mail ("outraloja.com.br" em
  // "contato@outraloja.com.br") também bate no padrão de URL — rodando URL
  // primeiro, ele comeria só o domínio e deixaria o "contato@" sobrando.
  result = result.replace(EMAIL_PATTERN, "");
  result = result.replace(URL_PATTERN, "");
  result = result.replace(MENTION_PATTERN, "");
  result = result.replace(TRIGGER_THEN_PHONE, "");
  result = result.replace(PHONE_THEN_TRIGGER, "");
  result = result.replace(BARE_PHONE_PATTERN, "");
  result = stripStoreName(result);
  return cleanupLines(result);
}
