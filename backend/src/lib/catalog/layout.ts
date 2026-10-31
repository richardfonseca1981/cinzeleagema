// Layout do PDF de catálogo — páginas 9:16 em pt (1pt = 1/72"). Mantido num
// único arquivo de constantes para o visual inteiro (cores, medidas) poder
// ser ajustado num só lugar sem caçar números mágicos pelos outros módulos.

export const PAGE_WIDTH = 810;
export const PAGE_HEIGHT = 1440;

// Cores da marca — mesmos valores hexadecimais do admin/export (ver
// productExport.routes.ts e identidade visual do site público).
export const COLOR_NAVY = "#010B1A";
export const COLOR_GOLD = "#C78F50";
export const COLOR_WHITE = "#FFFFFF";
// Texto de corpo (descrição) um pouco apagado sobre o navy, para não
// competir com título/preço em branco puro.
export const COLOR_WHITE_MUTED = "#D9D9D9";

// A foto fica INTEIRA visível (contain) dentro da área de foto — o painel
// escuro é uma caixa SEPARADA abaixo dela, sem sobrepor nem cortar nada da
// imagem (2º ajuste visual: o painel cobrindo ~40% de baixo, no desenho
// anterior, cortava a base de peças como obelisco/suporte do ovo de
// ametista). ~68% da altura da página é área de foto, ~32% é painel.
export const PHOTO_AREA_HEIGHT = Math.round(PAGE_HEIGHT * 0.68);
export const PANEL_HEIGHT = PAGE_HEIGHT - PHOTO_AREA_HEIGHT;

export const PANEL_MARGIN_X = 48;
// Distância do topo do painel até o título — o painel já começa logo abaixo
// da foto, sem respiro extra (a foto já define a borda superior visualmente).
export const PANEL_TOP_PADDING = 40;

export const TITLE_FONT_SIZE = 32;
export const REF_FONT_SIZE = 15;
export const DESCRIPTION_MAX_FONT_SIZE = 16;
export const DESCRIPTION_MIN_FONT_SIZE = 11;
// Texto de identificação (curto, 1 linha tipicamente) tem bem mais espaço;
// a description de fallback é deliberadamente capada bem mais baixo (ver
// REGRAS: "truncada em no máximo 2-3 linhas" — não é o mesmo limite usado
// quando o texto vem da identificação por IA).
export const DESCRIPTION_MAX_HEIGHT_IDENTIFICATION = 140;
export const DESCRIPTION_MAX_HEIGHT_FALLBACK = 64;

export const TAM_FONT_SIZE = 14;
// Preço e "Ref:" num único tamanho (branco, negrito) — ver REGRAS: "bem
// maior e em destaque, branco e em negrito", diferente do desenho anterior
// (símbolo pequeno + inteiro grande + centavos pequenos, tudo dourado).
export const PRICE_FONT_SIZE = 44;
export const PRICE_UNAVAILABLE_FONT_SIZE = 22;

// Aviso legal curto (uma linha, opcional, só se couber) repetido em cada
// página de peça — aponta para o aviso completo na página de contato (ver
// CATALOG_LEGAL_NOTICE em pdfPages.ts). Deliberadamente pequeno: não é para
// competir com título/preço.
export const LEGAL_LINE_FONT_SIZE = 9;

// Distância da base da página até a linha dourada — ela agora fica por
// último, abaixo de TODAS as informações (ver REGRAS: "linha dourada na
// base da página, abaixo das informações"), não mais logo acima do rodapé.
export const BOTTOM_MARGIN = 28;
// Respiro entre a linha dourada e o aviso legal de uma linha acima dela.
export const LEGAL_LINE_GAP = 14;
// Respiro entre o aviso legal e a linha Tam./Preço acima dele.
export const FOOTER_GAP = 14;
// Espaço reservado acima da linha de base do preço para o ascender do texto
// grande (aproximação: ~0.8 * PRICE_FONT_SIZE).
export const FOOTER_ROW_RESERVE = Math.round(PRICE_FONT_SIZE * 0.85);

// Brilhos dourados sutis no fundo do painel (ver sparkles.ts) — contagem e
// faixa de raio/opacidade fixas para o efeito ficar discreto.
export const SPARKLE_COUNT = 90;
export const SPARKLE_MIN_RADIUS = 0.5;
export const SPARKLE_MAX_RADIUS = 1.8;
export const SPARKLE_MIN_OPACITY = 0.08;
export const SPARKLE_MAX_OPACITY = 0.35;
