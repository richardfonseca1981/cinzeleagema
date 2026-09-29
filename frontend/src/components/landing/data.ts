// Config estrutural do menu (rotas/âncoras) — os textos exibidos vêm das
// traduções (frontend/src/locales/*.json) via labelKey, não ficam fixos aqui.

// "Contato" abre o modal "Fale Conosco" em vez de navegar. "Produtos" é uma
// rota real (catálogo público), não mais uma âncora para a seção da landing.
// Os demais itens usam "/#id" (não só "#id") para funcionar tanto na landing
// quanto vindos de outra página (ex.: catálogo) — nesse caso é uma navegação
// de página inteira até "/", com o navegador rolando até a âncora depois do
// carregamento.
export const NAV_LINKS = [
  { kind: "anchor", href: "/#home", labelKey: "header.nav.home" },
  { kind: "anchor", href: "/#sobre", labelKey: "header.nav.about" },
  { kind: "route", to: "/catalogo", labelKey: "header.nav.products" },
  { kind: "anchor", href: "/#blog", labelKey: "header.nav.blog" },
  { kind: "anchor", href: "/#faq", labelKey: "header.nav.faq" },
  { kind: "modal", labelKey: "header.nav.contact" },
] as const;
