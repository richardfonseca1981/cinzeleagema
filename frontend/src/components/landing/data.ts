// Todo o conteúdo abaixo marcado como "placeholder" é provisório e deve ser
// substituído quando o catálogo real, as fotos e o blog do cliente estiverem
// disponíveis. Nenhum destes dados vem de API — são estáticos, conforme
// decisão de escopo do projeto (site 100% independente de backend).

// "Onde Comprar" é um link direto para o WhatsApp (não uma âncora — não há
// seção "Onde Comprar" no corpo da página). "Contato" abre o modal "Fale
// Conosco" em vez de navegar.
export const NAV_LINKS = [
  { kind: "anchor", href: "#home", label: "Home" },
  { kind: "anchor", href: "#sobre", label: "Sobre Nós" },
  { kind: "anchor", href: "#produtos", label: "Produtos" },
  { kind: "whatsapp", label: "Onde Comprar" },
  { kind: "anchor", href: "#blog", label: "Blog" },
  { kind: "anchor", href: "#faq", label: "FAQ" },
  { kind: "modal", label: "Contato" },
] as const;

// Hero em layout split (coluna de texto + coluna de imagem), estático —
// sem carrossel.
export const HERO_CONTENT = {
  title: "Pedras preciosas selecionadas com curadoria e procedência",
  subtitle: "Peças únicas, com atenção à qualidade, à origem e à documentação de cada pedra.",
};

// Peças placeholder — nomes genéricos só para preencher o grid visualmente.
// Substituir pelo catálogo real assim que ele for integrado.
export const PLACEHOLDER_PRODUCTS = [
  { name: "Esmeralda Lapidada", description: "Peça única, lapidação em corte esmeralda" },
  { name: "Ametista Bruta", description: "Tonalidade profunda, sem lapidação" },
  { name: "Topázio Imperial", description: "Cor laranja-rosada característica" },
  { name: "Rubi Lapidado", description: "Corte oval, alta transparência" },
  { name: "Safira Azul", description: "Peça com laudo gemológico disponível" },
  { name: "Turmalina Verde", description: "Tonalidade vibrante, corte pera" },
  { name: "Citrino Lapidado", description: "Corte redondo, brilho intenso" },
  { name: "Quartzo Rosa", description: "Peça bruta, tom suave e uniforme" },
  { name: "Granada Vermelha", description: "Corte cushion, alta claridade" },
] as const;

export const FAQ_ITEMS = [
  {
    question: "O que é quilate de uma pedra preciosa?",
    answer:
      "Quilate (ct) é uma unidade de massa, não de tamanho — 1 quilate equivale a 200 miligramas. É comum confundir com \"quilate\" de ouro (que mede pureza, em partes de 24), mas para pedras preciosas o quilate é sempre peso. Duas pedras do mesmo peso em quilates podem ter tamanhos visuais diferentes dependendo da densidade do mineral e da forma como foram lapidadas — por isso o quilate sozinho não define o valor de uma peça, ele é sempre avaliado junto com corte, cor e claridade.",
  },
  {
    question: "Qual a diferença entre corte e lapidação?",
    answer:
      "Lapidação é o processo completo de transformar a pedra bruta na peça final — inclui o desbaste, o polimento e a definição da forma. Corte é o resultado desse processo: o formato geométrico e o conjunto de facetas aplicados (redondo, oval, esmeralda, pera, cushion, entre outros), além das proporções e simetria entre essas facetas. Um corte bem executado influencia diretamente como a pedra reflete e refrata a luz — duas pedras da mesma espécie mineral e do mesmo peso podem ter brilho muito diferente dependendo da qualidade do corte aplicado na lapidação.",
  },
  {
    question: "O que significa a claridade (ou pureza) de uma pedra?",
    answer:
      "Claridade descreve a presença de inclusões — pequenas imperfeições internas ou externas, naturais da formação geológica da pedra — e o quanto elas são visíveis a olho nu ou em ampliação. Escalas gemológicas (como FL/IF para pedras sem inclusões visíveis, VVS, VS, SI e I, em ordem decrescente de pureza) classificam esse aspecto. Pedras com claridade mais alta tendem a ser mais raras e valorizadas, mas para várias espécies as inclusões fazem parte do caráter natural da peça e não comprometem sua beleza ou durabilidade.",
  },
  {
    question: "Como identificar um certificado ou laudo gemológico confiável?",
    answer:
      "Um laudo gemológico confiável é emitido por um laboratório ou instituto reconhecido no setor (no Brasil, o IBGM — Instituto Brasileiro de Gemas e Metais Preciosos — é uma referência), e deve trazer, no mínimo: identificação da espécie mineral, peso em quilates, dimensões, descrição do corte, observações sobre claridade e cor, e qualquer tratamento identificado na pedra. Para peças de maior valor, vale sempre solicitar o laudo antes da compra — ele é o que garante, de forma independente, que as características informadas correspondem à pedra física.",
  },
  {
    question: "Qual a diferença entre pedra natural, sintética e tratada?",
    answer:
      "Pedra natural se forma por processos geológicos ao longo de milhares a milhões de anos. Pedra sintética (ou \"de laboratório\") tem a mesma composição química e estrutura cristalina da natural, mas é produzida artificialmente em um intervalo de tempo muito menor — não deve ser confundida com simulantes (como zircônia cúbica), que imitam a aparência mas têm composição diferente. Já uma pedra tratada é uma pedra natural que passou por algum processo para realçar cor ou claridade (aquecimento e óleo são os mais comuns, por exemplo em esmeraldas). Tratamentos são uma prática comum e aceita no mercado, desde que informados — por isso o laudo gemológico costuma registrar quando um tratamento foi identificado.",
  },
  {
    question: "Como cuidar e limpar joias com pedras preciosas?",
    answer:
      "Os cuidados variam por espécie mineral: pedras mais porosas ou tratadas com óleo, como algumas esmeraldas, não devem ir a limpadores ultrassônicos nem ter contato com produtos químicos agressivos, que podem remover o tratamento e escurecer fissuras internas. Como regra geral e segura para a maioria das peças: limpe com água morna, sabão neutro e uma escova de cerdas macias, seque com pano macio, evite variações bruscas de temperatura e guarde cada peça separadamente para não riscar outras joias. Na dúvida sobre uma pedra específica, o mais seguro é perguntar antes de usar qualquer método de limpeza.",
  },
  {
    question: "Por que pedras da mesma \"cor nominal\" variam de tom?",
    answer:
      "A cor de uma pedra preciosa vem de traços de elementos químicos presentes durante sua formação geológica — por exemplo, cromo e vanádio dão à esmeralda seu verde característico, enquanto variações na proporção desses elementos (e a presença de ferro) mudam o tom entre um verde mais azulado ou mais amarelado. Como a concentração desses elementos varia de jazida para jazida — e até dentro da mesma jazida — duas pedras da mesma espécie mineral e da mesma classificação de cor nominal podem apresentar tons visivelmente diferentes. É também por isso que a origem geográfica costuma constar no laudo gemológico de peças de maior valor.",
  },
] as const;

// Cards de blog placeholder — sem sistema de blog funcional ainda, apenas a
// estrutura visual da seção.
export const BLOG_PLACEHOLDER_POSTS = [
  {
    title: "Como identificar um certificado gemológico confiável",
    excerpt: "O que um laudo sério precisa informar antes de você fechar a compra de uma peça.",
  },
  {
    title: "Pedra natural, sintética e tratada: entenda as diferenças",
    excerpt: "Três conceitos que costumam ser confundidos — e por que essa distinção importa.",
  },
  {
    title: "Cuidados essenciais para joias com pedras preciosas",
    excerpt: "Boas práticas de limpeza e armazenamento para preservar cada peça por mais tempo.",
  },
] as const;

export const GALLERY_PLACEHOLDER_ITEMS = [
  "Peças em destaque",
  "Processo de lapidação",
  "Certificação gemológica",
  "Curadoria",
  "Atendimento",
  "Embalagem e apresentação",
] as const;
