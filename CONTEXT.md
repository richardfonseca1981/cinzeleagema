# Contexto do Projeto — Cinzel e a Gema (site de pedras preciosas)

## Sobre o cliente
- Mesmo cliente terceiro do site irmão TechFlow Distribuidora (óleo automotivo) e do FluxioDesk — projeto DISTINTO, repositório e escopo próprios, mesma stack técnica
- Situação financeira delicada — decisões de escopo e preço levam isso em conta
- Cada peça costuma ser item único (não é produto padronizado/repetível como o óleo)
- Marca definitiva: Cinzel e a Gema
- Domínio: cinzeleagema.com.br — registrado (Registro.br), mas **ainda não está no ar**: o repositório não tem nenhuma configuração de deploy (sem `vercel.json`, sem config de Railway, histórico com um único commit "setup inicial do projeto") e o próprio README lista "Deploy real em Railway (backend/DB) e Vercel (frontend)" como pendência da próxima fase, não como algo já feito
- Repositório GitHub: `richardfonseca1981/cinzeleagema`
- WhatsApp de contato: AINDA NÃO DEFINIDO — usuário vai adquirir número próprio; até lá, atendimento no FluxioDesk usa o mesmo número do óleo ((14) 98809-5356)

## Modelo comercial
- Pagamento único à vista: R$ 2.000 pelo projeto completo (mesmo valor do óleo, ajustado à situação financeira do cliente)

## Stack técnica
- Idêntica ao projeto de óleo: Node.js + Express + TypeScript + Prisma **5.22.0** (pinado) + PostgreSQL, React + Vite + TypeScript + Tailwind, monorepo npm workspaces, Cloudflare R2, deploy alvo Vercel (frontend) + Railway (backend) — **nenhum dos dois em produção ainda**
- Testes: Vitest + Supertest (backend)
- Portas em dev: backend `3334`, frontend `5174`, Postgres local via docker-compose `5436` (escolhida para não colidir com o Postgres do site-vendas-oleo, que usa `5434`), microserviço `rembg` `8001`

## Decisões de arquitetura
- Cadastro de peça simplificado em 2026-09-26 (decisão revista) — Felipe (cliente) definiu que não haverá diferenciação de campos técnicos por tipo de pedra. A decisão anterior (registrada aqui até 2026-09-26) era usar `Product.attributes` (Json) para quilate, corte, origem, certificado/laudo gemológico, cor, claridade etc., com schema leve descrito por `Category.attributeSchema`. Todo esse sistema (model `Category`, `Product.categoryId`/`category`/`attributes`, rotas `/api/categories`, `DynamicAttributeFields.tsx`) foi **removido por completo** — migration `20260926130000_remove_category_and_attributes` dropa a tabela `Category` e as colunas `categoryId`/`attributes` de `Product` (produtos existentes perdem essa informação, aceito e confirmado antes de aplicar). Cadastro de peça hoje é só: nome, descrição, preço, SKU, peso (`weightGrams`), tamanho (`sizeCm`), estoque opcional e fotos — campos fixos, iguais para qualquer peça
- Categorias/subcategorias reintroduzidas em 2026-09-26 (migration `20260926150000_add_categories`), mas só para organização/navegação/filtro do catálogo — sem trazer de volta `attributeSchema`/`attributes`. Models `Category` (id, name, slug) e `Subcategory` (id, name, slug, categoryId); `Product.categoryId` obrigatório, `Product.subcategoryId` opcional (null quando a categoria não tem subcategorias). Estrutura real fornecida pelo cliente: Pedras Brutas (Pedras Brutas Peça, Capelas de Ametista, Capelas de Citrino, Pedras Exclusivas), Pedras Polidas (Pedras Roladas, Pedras Polidas Exclusivas), Big (Ametistas, Calcitas, Citrinos, Formas), Homedecor e Acessorios (sem subcategorias) — populada via `prisma/seed.ts`. Rota `GET /api/categories` é pública (sem `requireAuth`), pensada para navegação/filtro do catálogo público; `GET /api/products` aceita filtro opcional por `categoryId`/`subcategoryId`. Validação de categoria/subcategoria obrigatória fica no handler das rotas de produto (`resolveSubcategoryId` em `product.routes.ts`), não no Zod, porque depende de consulta ao banco (se a categoria tem subcategorias)
- Peso (`weightGrams`, gramas) e tamanho (`sizeCm`, centímetros) — campos fixos do `Product` desde 2026-09-25, obrigatórios no cadastro (Decimal, `@default(0)` só como rede de segurança de migration)
- Estoque tipicamente unitário: `trackStock=false` (padrão, peça única sem controle de quantidade) ou `trackStock=true` + `stockQty=1` quando o admin preferir controlar disponibilidade explicitamente
- Painel admin invisível ao público, protegido por JWT (`requireAuth`), sem link público; frontend usa `ProtectedRoute`
- Upload de imagem via URL assinada do R2 — backend nunca recebe o arquivo (`presign` → `PUT` direto → confirma registro `ProductImage`)

## Checkout
- Ainda não implementado nesta fase (não há vitrine pública, carrinho nem checkout — ver "Fases do projeto")
- Planejado: também será encaminhado ao setor de Vendas do FluxioDesk (mesmo padrão do óleo), com atendimento separado por marca (chat/setor próprio para Cinzel e a Gema, distinto do TechFlow) mas os mesmos agentes atendendo as duas marcas

## Tratamento de foto sob demanda — JÁ IMPLEMENTADO (não é só design)
Diferente do que se poderia supor, esta funcionalidade **já está construída e testada** (não é uma fase futura):
- Fluxo: admin escreve pedido em texto livre no painel → Claude API (`claude-haiku-4-5`, tool use obrigatório) traduz para uma lista ordenada de operações dentre 9 permitidas (`resize`, `crop`, `brightness`, `contrast`, `sharpen`, `rotate`, `compress`, `convertFormat`, `removeBackground`) ou marca `unclear` → backend valida de novo cada operação (`backend/src/lib/imageOperations.ts`, lista fechada + ranges) → 8 operações rodam com Sharp no backend Node; `removeBackground` é delegada ao microserviço Python `rembg` (self-hosted, FastAPI, Docker, `rembg-service/`)
- Resultado salvo como objeto novo no R2 (preview); imagem do produto só muda quando admin confirma no painel; undo de um nível via `ProductImage.previousUrl`/`previousKey`
- Rotas (protegidas por `requireAuth`): `POST /api/products/:productId/images/:imageId/treatment/{preview,confirm,discard}`, `POST /api/products/:productId/images/:imageId/undo`
- Nada é automático — só roda quando o admin explicitamente pede e clica em "Aplicar"; upload não dispara tratamento
- Testado: as 9 operações têm teste unitário puro (`backend/tests/imageOperations.test.ts`). As rotas de `imageTreatment.routes.ts` que de fato chamam a Claude API e o microserviço `rembg` têm teste de integração real em `backend/tests/imageTreatment.integration.test.ts` (chamada real à Claude API, remoção de fundo real via `rembg`, fallback 503 sem `ANTHROPIC_API_KEY`, erro 502 tratado quando o `rembg` está fora do ar) — roda só via `npm run test:integration` (não faz parte de `npm run test:backend`, pois consome créditos da Anthropic e depende de serviço externo). Validado em 2026-09-21: com `rembg` real rodando via Docker e sem `ANTHROPIC_API_KEY` configurada neste ambiente, os 3 testes aplicáveis passaram de verdade contra o serviço; o teste da Claude API foi pulado (aviso explícito no console) por falta da chave — ainda não validado com uma chamada Anthropic real
- Fora de escopo (deliberado): upscaling/geração de detalhe via IA generativa; correção automática de cor por IA — precisão de cor da pedra deve ser resolvida operacionalmente (orientar cliente a fotografar com luz neutra/referência de cor), não via IA, pelo risco de propaganda enganosa
- Limitação conhecida: ao confirmar um tratamento, o objeto R2 anterior não é apagado (permite o "desfazer"), o que deixa objetos órfãos no bucket sem limpeza automática ainda
- Em produção (quando o deploy acontecer), o `rembg` deve rodar como serviço separado dentro do Railway — isso torna o custo de tratamento de foto NÃO mais R$0 puro (consome CPU/RAM extra, mesmo sem cobrança por imagem)

## Identidade visual — CONCLUÍDA em 2026-09-21 (decisão revista)
- Decisão anterior (registrada aqui até 2026-09-21) era usar uma paleta PRÓPRIA, distinta do óleo. O usuário revisou essa decisão deliberadamente e pediu para reaproveitar a paleta EXATA do site de óleo/FluxioDesk, para dar consistência visual ao ecossistema de marcas do mesmo cliente terceiro — confirmado explicitamente antes da implementação (não foi engano).
- Estrutura replicada do site de óleo (`site-vendas-oleo/frontend/src/components/landing/`), adaptando só o conteúdo: Header (sticky, logo + menu Home/Sobre Nós/Produtos/Onde Comprar/Blog/FAQ/Contato), WhatsApp flutuante, Hero split-screen, grid de peças em destaque, banner de confiança, FAQ técnica em accordion (quilate, corte vs. lapidação, claridade, laudo gemológico, natural vs. sintética/tratada, cuidados, variação de tom), "Quem somos nós", seção de certificação (placeholder, referenciando IBGM), galeria, blog ("Em breve"), footer, modal "Fale Conosco" (sem submit funcional) e modal "Política de Qualidade"
- Implementado em `frontend/src/pages/Landing.tsx` + `frontend/src/components/landing/*` — cores aplicadas como valores arbitrários do Tailwind (`bg-[#1B3A6B]` etc.), sem estender `tailwind.config.js` (config simplificado, tema antigo "gem" preto/dourado removido junto com a página `Home.tsx` que ele estilizava)
- Paleta aplicada (idêntica ao óleo): azul marca `#1B3A6B` (hover `#152D54`), azul institucional escuro `#15305A`, azul claro `#93B4D9`, texto principal `#1A1A1A`, texto secundário `#64748B`, texto terciário `#94A3B8`, borda `#E2E8F0`, fundo geral `#F8FAFC`, fundo alternativo `#F1F5F9`, fundo destaque suave `#EFF6FF`, WhatsApp `#25D366`
- 100% estático, zero fetch/chamada de rede em runtime — validado com `npm run dev:frontend` isolado (sem backend), `tsc --noEmit` e `vite build`, todos sem erro
- Nomes de peças placeholder (Esmeralda Lapidada, Ametista Bruta, Topázio Imperial, Rubi Lapidado, Safira Azul, Turmalina Verde, Citrino Lapidado, Quartzo Rosa, Granada Vermelha) — só para preencher o grid, sem ligação com o catálogo real
- Painel admin (`AdminLayout`, `ProductList`, `ProductForm` etc.) NÃO foi alterado — continua neutro (Tailwind `slate` padrão), por ser uso interno sem identidade de marca necessária

## Custo de infraestrutura estimado
- Cloudflare R2: ~R$0/mês
- Tratamento de foto: não mais R$0 puro quando o `rembg` estiver rodando em produção no Railway (consome recursos, mesmo sem cobrança por imagem)

## Fases do projeto
- Fase 1 (concluída): fundações técnicas — schema Prisma (`AdminUser`, `Category`, `Subcategory`, `Product`, `ProductImage`), auth JWT, CRUD de produtos, categorias/subcategorias de organização, upload de imagem via R2, painel admin básico, testes de integração (produtos, categorias, auth)
- Fase 1.5 (concluída, não é mais pendência): tratamento de foto sob demanda com remoção de fundo — já implementado e com teste unitário das operações; falta apenas teste de integração das rotas que chamam Claude API/rembg
- Fase 1.7 (concluída): identidade visual completa — paleta e estrutura reaproveitadas do site de óleo, ver seção "Identidade visual" acima
- Fase 2 (planejada): vitrine pública, carrinho, checkout + gateway de pagamento, cálculo de frete, NF-e, cadastro/login de cliente final, exibição de timestamps em BRT no frontend (hoje API retorna UTC cru), deploy real em Railway (backend/DB) + Vercel (frontend), integração com FluxioDesk

## Credenciais de desenvolvimento (seed)
- Admin: `admin@site-pedras-preciosas.com` / senha `admin123` (sobrescrevível via `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`) — **trocar em produção**
- Categorias/subcategorias reais do cliente (Pedras Brutas, Pedras Polidas, Big, Homedecor, Acessorios — ver "Decisões de arquitetura") e 3 produtos de exemplo (Esmeralda Colombiana, Ametista Uruguaia, Topázio Imperial), cada um já associado a uma categoria/subcategoria real
- Banco de testes precisa ser criado manualmente uma vez: `docker exec site-pedras-preciosas-db psql -U postgres -c "CREATE DATABASE site_pedras_preciosas_test;"`

## Padrões técnicos
- Prisma pinado (v5.22.0), nunca `db push` em produção — sempre `prisma migrate dev` (dev) / `prisma migrate deploy` (produção)
- Nunca commitar `.env` (só `.env.example`)
- Timestamps em UTC no banco; conversão para BRT é responsabilidade do frontend na exibição — ainda não implementada (não há telas voltadas ao cliente final nesta fase)

## Problemas conhecidos
- `npm audit` pode apontar vulnerabilidades em dependências de terceiros (ex: `react-router-dom`, open redirect) sem correção disponível na faixa usada aqui. Não afeta o painel admin (uso interno, sem redirects vindos de input de usuário), mas vale revisar ao atualizar dependências
- Objetos R2 órfãos após tratamento de foto confirmado (ver seção de tratamento de foto acima) — sem limpeza automática ainda
