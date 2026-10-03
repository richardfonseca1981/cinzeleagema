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

## Checkout — catálogo público implementado em 2026-09-26 (sem pagamento no site)
- Rotas públicas (sem `requireAuth`): `GET /api/categories`, `GET /api/products` (com filtro opcional `categoryId`/`subcategoryId`) e `GET /api/products/:id` — alimentam `/catalogo`, `/catalogo/:id`, `/carrinho` e `/finalizar` no frontend. Só as rotas que alteram produto (`POST`/`PATCH`/ativar/desativar) continuam exigindo login de admin
- Carrinho é 100% client-side (`frontend/src/lib/cart.tsx`, contexto React + `localStorage`, chave `cinzeleagema_cart`) — nada é persistido no backend até o pedido ser finalizado
- Finalização de pedido (`POST /api/orders`, pública, sem auth): tenta entregar ao FluxioDesk via `FLUXIODESK_API_URL`/`FLUXIODESK_API_KEY` (variáveis só no backend — nunca expostas ao browser); se as variáveis estiverem ausentes ou a chamada falhar, responde `{ delivered: false }` e o frontend cai para um link `wa.me` com a mensagem do pedido pré-preenchida (`VITE_WHATSAPP_NUMBER`). Carrinho é limpo depois do envio, por qualquer um dos dois caminhos. Não há pagamento nem gateway no site — é só encaminhamento do pedido
- Também será encaminhado ao setor de Vendas do FluxioDesk (mesmo padrão do óleo), com atendimento separado por marca (chat/setor próprio para Cinzel e a Gema, distinto do TechFlow) mas os mesmos agentes atendendo as duas marcas

## Frete nacional — Parte 1A implementada em 2026-10-03 (backend + admin; internacional é a Parte 1B, ainda não implementada)
Decisões de produto (já tomadas, não revisitar sem pedido explícito):
- Cliente não tem contrato com os Correios — frete nacional é cotação automática via Melhor Envio, usando **somente** o endpoint de cálculo (`shipment/calculate`, consulta sem custo). Nunca chamar carrinho/compra/geração ou cancelamento de etiqueta a partir deste projeto
- Dimensões de embalagem são estimadas automaticamente a partir de `sizeCm`/`weightGrams` da peça (caixa cúbica = `sizeCm + 2×SHIPPING_PADDING_CM` por lado, peso = `weightGrams + SHIPPING_PACKAGING_WEIGHT_G`), com `Product.packageLengthCm/packageWidthCm/packageHeightCm` opcionais para o admin corrigir quando a estimativa erraria (peça muito achatada/alongada etc.)
- Todo valor monetário no servidor é BRL, `number` com 2 casas, nunca string formatada — conversão para USD é só no frontend (reaproveita `GET /api/exchange-rate` já existente)
- País diferente de BR responde "indisponível" (`reason: "not_configured"`) nesta parte — frete internacional de verdade é a Parte 1B

Arquitetura (`backend/src/lib/shipping/`):
- `types.ts` define o contrato `ShippingProvider`/`ShippingQuoteResult` sem depender de env/prisma/fetch — um provider internacional (Parte 1B) implementa a mesma interface sem alterar o endpoint público
- `packageEstimator.ts` (função pura, testada) calcula a caixa; `limits.ts` guarda os mínimos (piso, aplicado no estimador) e máximos (teto, checado no provider antes de chamar a API) de dimensão/peso — **valores padrão Correios/transportadoras parceiras (16×11×2cm, 300g mínimo; 105cm maior lado, 200cm soma dos lados, 30kg máximo), não publicados pela API da Melhor Envio, ajustáveis se o cliente trocar de transportadora**
- `melhorEnvioProvider.ts` implementa `ShippingProvider` chamando só `POST /api/v2/me/shipment/calculate` (prod `https://melhorenvio.com.br`, sandbox `https://sandbox.melhorenvio.com.br`), payload `products[]` (um item por produto do carrinho, com `quantity` — a própria Melhor Envio decide o empacotamento), `insurance_value` = preço unitário real do produto. Timeout 8s via `AbortController`, no máximo 1 retry (só para erro de rede/timeout/5xx; erro de validação ou 401/403 não tenta de novo). Serviço individual com `error` ou preço inválido é omitido do resultado (campo `error` por item não é documentado oficialmente pela Melhor Envio, mas existe na prática — tratado defensivamente)
- `quoteService.ts` orquestra: cache (10min, chave país+CEP+itens) → busca produtos reais no banco (nunca confia em peso/preço/dimensão do cliente) → estima embalagem por item → chama o provider → combina com `viaCep.ts` (cidade/estado, nunca bloqueia a cotação se falhar)
- Rate limit simples por IP (`middleware/rateLimit.ts`, 20 req/min) em `POST /api/shipping/quote` — não havia infra de rate limit no projeto antes desta parte, foi implementada aqui

Contrato da API (consumido pelo frontend público na Parte 2 — carrinho/checkout):
- `POST /api/shipping/quote` — body `{ country: "BR", postalCode, items: [{ productId, quantity }] }` (país alpha-2; CEP aceita máscara, normalizado para 8 dígitos; quantidade 1-99). Resposta: `{ destination, mode: "domestic"|"international", options: [{ id, carrier, service, priceBRL, deliveryDaysMin, deliveryDaysMax, kind: "quoted"|"estimated" }], requiresConfirmation, notice: "taxes_not_included"|null, unavailable: null|{ reason } }`. `reason` ∈ `provider_error`, `no_rates_configured`, `invalid_destination`, `over_limits`, `incomplete_product_data`, `not_configured`. Nenhum texto pronto em nenhum idioma — o frontend traduz pelos códigos
- `GET /api/shipping/postal-code/:code` — `{ postalCode, city, state }` via ViaCEP; `city`/`state` vêm `null` (200, nunca erro) se o ViaCEP falhar
- `GET /api/shipping/status` (admin, `requireAuth`) — `{ domestic: { melhorEnvioTokenConfigured, originCepConfigured, sandbox }, international: null }`, nunca expõe valores, só booleanos. Página "Frete" no admin (`/admin/frete`) é só leitura nesta parte

Variáveis de ambiente (todas opcionais no boot — sem token/CEP de origem, a rota responde "indisponível" em vez de derrubar o servidor): `MELHOR_ENVIO_TOKEN`, `MELHOR_ENVIO_USER_AGENT` (formato `"Nome da aplicação (email técnico)"`, exigido pela Melhor Envio), `MELHOR_ENVIO_SANDBOX`, `SHIPPING_ORIGIN_CEP`, `SHIPPING_PACKAGING_WEIGHT_G` (default 200), `SHIPPING_PADDING_CM` (default 3). **Atenção: o token do Melhor Envio expira periodicamente e precisa ser renovado manualmente no painel deles (Gerenciar > Tokens) — não há renovação automática; quando expirar, o provider loga "token do Melhor Envio inválido ou expirado" e a rota passa a responder indisponível até o token ser trocado no ambiente do servidor.**

Campo de produto novo (admin): seção recolhível "Embalagem (opcional)" no formulário (`ProductForm.tsx`), 3 campos opcionais em cm — some do payload quando vazios (`null`), vão direto para `packageLengthCm/Width/Height` do `Product`.

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

## Identidade visual — CONCLUÍDA em 2026-09-21, paleta e logo revisados em 2026-09-29 (decisão revista de novo)
- Decisão de 2026-09-21 (mantida só como histórico): usar a paleta EXATA do site de óleo/FluxioDesk, para dar consistência visual ao ecossistema de marcas do mesmo cliente terceiro.
- Em 2026-09-29 essa decisão foi revertida por pedido explícito do usuário: a paleta **deixou de ser compartilhada com o FluxioDesk** e passou a ser **exclusiva da Cinzel e a Gema**, extraída do logo oficial da marca (moldura de ágata azul e dourada). O projeto irmão `techflowdistribuidora`/FluxioDesk **não foi tocado** — a mudança é só neste repositório.
- Estrutura de seções da landing (Header, Hero, grid de peças, banner de confiança, FAQ, About, certificação, blog, footer, modais) continua a mesma; só as cores de marca e o logo mudaram.
- Nova paleta (valores arbitrários do Tailwind, sem estender `tailwind.config.js`):
  - Dourado (marca/destaque, botões primários, bordas de destaque/foco, valores de preço, labels "eyebrow", estado ativo de navegação): `#C78F50`, hover `#B37D3F`; texto sobre fundo dourado usa `#010B1A` (marinho) para contraste, não branco
  - Azul da gema (uso secundário — links de navegação, hover de itens de menu/categoria, ícones): `#5F84BA`
  - Azul-marinho (fundos escuros — sidebar do admin, footer, header/overlay do Hero): `#010B1A`
  - Madeira (`#623E22`) reservada para uso pontual/decorativo — não aplicada em nenhum componente ainda (nenhum encaixe óbvio apareceu nesta rodada)
  - Neutros mantidos sem alteração: texto principal `#1A1A1A`, texto secundário `#64748B`, texto terciário `#94A3B8`, borda `#E2E8F0`, fundo geral `#F8FAFC`, fundo alternativo `#F1F5F9`, WhatsApp `#25D366`
  - Fundos suaves que antes usavam o azul institucional (`#EFF6FF`, ex.: seção FAQ, ring de foco em inputs) foram trocados por dourado em baixa opacidade (`bg-[#C78F50]/10`, `focus:ring-[#C78F50]/20`), já que o antigo tom não existe mais na paleta
  - Textura de pontos do Hero mantida (mesmo SVG de padrão), só recolorida: base e overlay semi-transparente agora usam o mesmo `#010B1A` (antes eram dois azuis distintos do FluxioDesk); os pontos do padrão usam `#5F84BA`
  - Critério de divisão dourado vs. azul-da-gema para texto (decisão de implementação, já que a cor antiga `#1B3A6B` cobria os dois papéis): botões/CTA, preços, labels de destaque e estados ativos → dourado; links de navegação puros, hover de itens de menu e ícones → azul da gema
- Logo oficial completo (com moldura de ágata, ~1672×941px, proporção ~16:9) substituiu o logo temporário no mesmo caminho `frontend/src/assets/logo.png` — todos os usos (Header da landing, sidebar do `AdminLayout`, `Login`, favicon em `index.html`) já apontavam para esse arquivo, então a troca foi só do binário; nenhum crop ou remoção de fundo foi aplicado, o dimensionamento em cada tela é só via CSS (`object-contain` + altura/largura menor), preservando a imagem completa. Tamanhos: header `h-12` (48px), sidebar do admin `w-20` (80px, reduzido de `w-28` porque a imagem é mais larga que o logo antigo), login `h-20` (80px), favicon usa o arquivo integral reduzido pelo navegador
- Débito técnico conhecido: o PNG do logo oficial tem ~2MB (bem mais pesado que o logo temporário); não foi comprimido/otimizado nesta rodada porque não fazia parte do pedido — vale revisitar (ex. gerar um WebP ou PNG otimizado) antes de ir para produção, para não pesar o carregamento do Header/Login em toda página
- Implementado em `frontend/src/pages/Landing.tsx` + `frontend/src/components/landing/*`, mais os pontos de paleta espalhados por `AdminLayout`, `Login`, `ProductForm`, `ProductList`, `AdminUsers`, `ImageManager`, `Cart`, `Checkout`, `ProductDetail`, `ProductCard`, `CategoryNav`, `FloatingCartButton` (catálogo público e painel admin passaram a usar a mesma identidade — deixou de ser "admin neutro sem marca")
- 100% estático, zero fetch/chamada de rede em runtime — validado com `npm run dev:frontend` isolado (sem backend), `tsc --noEmit` e `vite build`, todos sem erro
- Nomes de peças placeholder (Esmeralda Lapidada, Ametista Bruta, Topázio Imperial, Rubi Lapidado, Safira Azul, Turmalina Verde, Citrino Lapidado, Quartzo Rosa, Granada Vermelha) — só para preencher o grid, sem ligação com o catálogo real

## Custo de infraestrutura estimado
- Cloudflare R2: ~R$0/mês
- Tratamento de foto: não mais R$0 puro quando o `rembg` estiver rodando em produção no Railway (consome recursos, mesmo sem cobrança por imagem)

## Fases do projeto
- Fase 1 (concluída): fundações técnicas — schema Prisma (`AdminUser`, `Category`, `Subcategory`, `Product`, `ProductImage`), auth JWT, CRUD de produtos, categorias/subcategorias de organização, upload de imagem via R2, painel admin básico, testes de integração (produtos, categorias, auth)
- Fase 1.5 (concluída, não é mais pendência): tratamento de foto sob demanda com remoção de fundo — já implementado e com teste unitário das operações; falta apenas teste de integração das rotas que chamam Claude API/rembg
- Fase 1.7 (concluída): identidade visual completa — paleta e estrutura reaproveitadas do site de óleo, ver seção "Identidade visual" acima
- Fase 1.9 (concluída em 2026-09-26): catálogo público real (`/catalogo`, `/catalogo/:id`) com navegação por categoria/subcategoria puxando dados reais da API, carrinho client-side e finalização de pedido sem pagamento (FluxioDesk com fallback WhatsApp) — ver "Checkout" acima
- Fase 1.95 (Parte 1A concluída em 2026-10-03): cálculo de frete nacional (backend + admin) — ver seção "Frete nacional" acima. Parte 1B (frete internacional) e Parte 2 (carrinho/checkout consumindo o contrato de frete) ainda pendentes
- Fase 2 (planejada): gateway de pagamento, NF-e, cadastro/login de cliente final, exibição de timestamps em BRT no frontend (hoje API retorna UTC cru), deploy real em Railway (backend/DB) + Vercel (frontend)

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
