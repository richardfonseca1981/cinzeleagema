// Layout do PDF de catálogo — páginas A4 retrato em pt (1pt = 1/72"). Mantido
// num único arquivo de constantes para o visual inteiro (cores, medidas)
// poder ser ajustado num só lugar sem caçar números mágicos pelos outros
// módulos.
//
// A4 (595.28 x 841.89 pt) substitui a página 9:16 (810x1440) original — ver
// AJUSTES A4. A foto da peça (tipicamente 9:16, retrato) continua INTEIRA
// visível (contain) dentro da área de foto, sem cortar nem distorcer; como a
// A4 é relativamente mais LARGA que 9:16, a faixa de fundo desfocado nas
// laterais da foto fica maior do que seria numa página 9:16 — mitigado
// reservando uma fração maior da altura da página para a foto (ver
// PHOTO_AREA_HEIGHT) e comprimindo as margens do painel de texto (ver
// AJUSTES A4, item 3).
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

// Fator usado para escalar fontes/espaçamentos do desenho original (810pt de
// largura) para a largura da A4 — todas as fontes abaixo são
// `Math.round(valorOriginal * PAGE_SCALE)`, com piso de 9pt (ver AJUSTES A4,
// item 2: "nada pode ficar com texto menor que ~9pt") quando o resultado da
// escala ficaria abaixo disso — é o caso só do aviso legal de uma linha, que
// já estava fixado em 9pt no desenho original.
const PAGE_SCALE = PAGE_WIDTH / 810;

// Cores da marca — mesmos valores hexadecimais do admin/export (ver
// productExport.routes.ts e identidade visual do site público).
export const COLOR_NAVY = "#010B1A";
export const COLOR_GOLD = "#C78F50";
export const COLOR_WHITE = "#FFFFFF";
// Texto de corpo (descrição) um pouco apagado sobre o navy, para não
// competir com título/preço em branco puro.
export const COLOR_WHITE_MUTED = "#D9D9D9";

// A foto fica INTEIRA visível (modo "contain", default) ou cobre a área
// inteira cortando o excedente (modo "cover" — ver PhotoFit/photoLayer.ts)
// dentro da área de foto — o painel escuro é uma caixa SEPARADA abaixo dela,
// sem sobrepor nem cortar nada da imagem em modo "contain".
//
// ALTURA VARIÁVEL (revisão visual pós-A4): a altura da área de foto NÃO é
// mais um percentual fixo da página — é PAGE_HEIGHT menos a altura real do
// painel, calculada a partir do conteúdo de CADA peça (ver pdfPages.ts
// computeProductPanelLayout): título curto + sem Ref/ficha técnica/
// descrição deixa o painel pequeno e a foto cresce; título longo (3 linhas)
// + ficha técnica + descrição longa deixa o painel maior e a foto encolhe.
// Estas duas constantes são só os LIMITES desse encolhe/cresce — ~70% é o
// valor típico pedido ("aumentar a área da foto para ~70%"), mas o cálculo
// real pode ir até os limites abaixo para não deixar a foto nem minúscula
// (conteúdo grande) nem o painel ilegível/sem rodapé (conteúdo mínimo).
export const PHOTO_AREA_MIN_FRACTION = 0.58;
export const PHOTO_AREA_MAX_FRACTION = 0.78;

// Margens do painel de texto — comprimidas ALÉM da escala proporcional pura
// (48 * PAGE_SCALE ≈ 35), ver AJUSTES A4 item 3 ("reduzir as faixas pretas
// laterais... que estão grandes").
export const PANEL_MARGIN_X = 30;
// Distância do topo do painel até o título — comprimida além da escala pura
// (40 * PAGE_SCALE ≈ 29), mesma lógica do PANEL_MARGIN_X.
export const PANEL_TOP_PADDING = 14;
// Espaçamento UNIFORME entre os blocos do painel (título -> Ref -> ficha
// técnica -> descrição -> rodapé) — ver AJUSTES A4/CATÁLOGO (revisão
// visual) item 3: "espaçamento uniforme e menor, sem vãos grandes". Um só
// valor para todas as transições em vez de uma constante de respiro
// diferente por par de blocos (o desenho anterior tinha +8, +10, variando
// por bloco sem motivo real).
export const PANEL_BLOCK_GAP = 10;

// Título: até MAX_TITLE_LINES linhas, reduzindo a fonte em passos
// (TITLE_FONT_SIZE -> TITLE_MIN_FONT_SIZE) antes de truncar (ver AJUSTES A4
// item 1 e textFit.ts fitTitleText). O bloco reservado no painel usa a
// altura REAL do título já ajustado (1, 2 ou 3 linhas — nunca mais sempre 3
// linhas fixas, ver revisão visual item 3), então um título curto não deixa
// vão vazio nem empurra os outros elementos para baixo sem necessidade.
export const TITLE_FONT_SIZE = 22;
export const TITLE_MIN_FONT_SIZE = 15;
export const MAX_TITLE_LINES = 3;

export const REF_FONT_SIZE = 11;

// Ficha técnica (Peso/Tamanho, rotulados — ver revisão visual item 4): bloco
// em destaque logo abaixo do título/Ref, não mais uma linha pequena ao lado
// do preço. Piso explícito de 10.5pt pedido — 11pt fica acima com folga.
export const SPEC_FONT_SIZE = 11;

export const DESCRIPTION_MAX_FONT_SIZE = 12;
// Piso de 10pt pedido explicitamente na revisão final do corpo (item 2) —
// acima do piso geral de 9pt do resto do catálogo (ver AJUSTES A4 item 2).
export const DESCRIPTION_MIN_FONT_SIZE = 10;
// Teto do espaço reservado para a descrição — comporta ~5 linhas mesmo no
// tamanho mínimo (ver REVISÃO FINAL item 2: "até ~5 linhas"); a altura REAL
// usada (depende do texto) é o que entra na conta do painel compacto (ver
// revisão visual item 3) — este é só um limite superior para a descrição
// não dominar o painel inteiro quando o texto é muito longo.
export const DESCRIPTION_MAX_HEIGHT = 110;

// Preço e "Ref:" num único tamanho (branco, negrito).
export const PRICE_FONT_SIZE = 28;
export const PRICE_UNAVAILABLE_FONT_SIZE = 15;

// Aviso legal curto (uma linha, opcional, só se couber) repetido em cada
// página de peça — aponta para o aviso completo na página de contato. Piso
// de 9pt pedido explicitamente (ver AJUSTES A4 item 2) — não escalado para
// baixo como os demais tamanhos.
export const LEGAL_LINE_FONT_SIZE = 9;

// Distância da base da página até a linha dourada — comprimida além da
// escala pura (28 * PAGE_SCALE ≈ 20), mesma lógica do PANEL_MARGIN_X.
export const BOTTOM_MARGIN = 16;
// Respiro entre a linha dourada e o aviso legal de uma linha acima dela.
export const LEGAL_LINE_GAP = 8;
// Respiro entre o aviso legal e a linha de preço acima dele (só reservado
// quando showPrice=true — ver revisão visual item 4: peso/tamanho saíram
// dessa linha, então sem preço não há mais nada nesse rodapé).
export const FOOTER_GAP = 8;
// Espaço reservado acima da linha de base do preço para o ascender do texto
// grande (aproximação: ~0.85 * PRICE_FONT_SIZE).
export const FOOTER_ROW_RESERVE = Math.round(PRICE_FONT_SIZE * 0.85);

// Capa, contato e divisor de categoria — mesmas proporções do desenho
// original (810pt de largura), reescaladas por PAGE_SCALE (ver AJUSTES A4
// item 2: "Reescalar todos os tamanhos de fonte, margens, espaçamentos,
// capa, divisores e contato proporcionalmente"). Tamanho de fonte com piso
// de 9pt quando a escala pura ficaria abaixo disso (só o parágrafo do aviso
// legal da página de contato, 12 * PAGE_SCALE ≈ 8.8).
export const COVER_LOGO_WIDTH = Math.round(260 * PAGE_SCALE);
export const COVER_TITLE_GAP = Math.round(48 * PAGE_SCALE);
export const COVER_TITLE_FONT_SIZE = Math.round(64 * PAGE_SCALE);
export const COVER_BRAND_GAP = Math.round(20 * PAGE_SCALE);
export const COVER_BRAND_FONT_SIZE = Math.round(18 * PAGE_SCALE);
export const COVER_LINE_GAP = Math.round(28 * PAGE_SCALE);
export const COVER_LINE_WIDTH = Math.round(220 * PAGE_SCALE);
export const COVER_DATE_GAP = Math.round(24 * PAGE_SCALE);
export const COVER_DATE_FONT_SIZE = Math.round(13 * PAGE_SCALE);

export const CONTACT_LOGO_WIDTH = Math.round(150 * PAGE_SCALE);
export const CONTACT_LOGO_GAP = Math.round(44 * PAGE_SCALE);
export const CONTACT_TITLE_FONT_SIZE = Math.round(52 * PAGE_SCALE);
export const CONTACT_TITLE_GAP = Math.round(28 * PAGE_SCALE);
export const CONTACT_LINE_WIDTH = Math.round(180 * PAGE_SCALE);
export const CONTACT_LINE_GAP = Math.round(40 * PAGE_SCALE);
export const CONTACT_INFO_FONT_SIZE = Math.round(24 * PAGE_SCALE);
export const CONTACT_INFO_GAP = Math.round(56 * PAGE_SCALE);
export const CONTACT_LEGAL_HEADING_FONT_SIZE = Math.round(16 * PAGE_SCALE);
export const CONTACT_LEGAL_HEADING_GAP = Math.round(18 * PAGE_SCALE);
export const CONTACT_LEGAL_BODY_FONT_SIZE = Math.max(9, Math.round(12 * PAGE_SCALE));
export const CONTACT_LEGAL_PARAGRAPH_GAP = Math.round(14 * PAGE_SCALE);

export const DIVIDER_LABEL_FONT_SIZE = Math.round(48 * PAGE_SCALE);
export const DIVIDER_PIECES_FONT_SIZE = Math.round(16 * PAGE_SCALE);
export const DIVIDER_PIECES_OFFSET = Math.round(64 * PAGE_SCALE);
export const DIVIDER_LINE_WIDTH = Math.round(160 * PAGE_SCALE);
export const DIVIDER_LINE_OFFSET = Math.round(104 * PAGE_SCALE);

// Brilhos dourados sutis no fundo do painel (ver sparkles.ts) — contagem
// reduzida proporcionalmente à área do painel (bem menor na A4 compacta) para
// manter a mesma densidade visual; raio/opacidade inalterados (cosmético).
export const SPARKLE_COUNT = 44;
export const SPARKLE_MIN_RADIUS = 0.5;
export const SPARKLE_MAX_RADIUS = 1.8;
export const SPARKLE_MIN_OPACITY = 0.08;
export const SPARKLE_MAX_OPACITY = 0.35;

// Exportado só para os testes conferirem a conta de escala citada nos
// comentários acima.
export const __PAGE_SCALE_FOR_TESTS = PAGE_SCALE;
