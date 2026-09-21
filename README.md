# Site Pedras Preciosas — Fundações

E-commerce para venda de pedras preciosas. Esta é a **fase 1**: as fundações
do projeto (banco de dados, API, autenticação de admin e painel
administrativo básico). Não há loja pública, carrinho ou checkout ainda —
veja [O que falta para a próxima fase](#o-que-falta-para-a-próxima-fase).

> Projeto irmão do [site-vendas-oleo](../site-vendas-oleo), reaproveitando os
> mesmos padrões técnicos (schema, autenticação, upload de imagem, estrutura
> de pastas). A diferença central: aqui cada peça costuma ser **única**, não
> um produto padronizado e repetível em estoque — ver
> [Modelo de dados — peça única](#modelo-de-dados--peça-única).

## Stack

- **Backend**: Node.js + Express + TypeScript + Prisma 5.22.0 + PostgreSQL
- **Frontend**: React + Vite + TypeScript + Tailwind CSS (UI neutra, sem
  identidade visual — aguardando definição do cliente, ver
  [Nota sobre identidade visual](#nota-sobre-identidade-visual))
- **Imagens**: Cloudflare R2 (upload via URL assinada, compatível com S3)
- **Tratamento de foto por IA**: Claude API (Haiku 4.5, tool use) para
  interpretar pedidos em texto + Sharp (operações de imagem) + microserviço
  Python (`rembg`, FastAPI, Docker) para remoção de fundo — ver
  [Tratamento de foto por IA](#tratamento-de-foto-por-ia)
- **Testes**: Vitest + Supertest (backend)
- **Deploy alvo** (não configurado nesta fase): Railway (backend/DB) + Vercel (frontend)

## Estrutura

```
/backend    Express + Prisma + TypeScript (API REST)
/frontend   Vite + React + TypeScript + Tailwind (painel admin)
```

Monorepo com **npm workspaces** — um único `npm install` na raiz instala as
dependências de ambos os pacotes.

## Pré-requisitos

- Node.js 20+
- PostgreSQL 14+ (local ou via Docker)
- Uma conta Cloudflare R2 (opcional nesta fase — só necessário para testar
  upload de imagens; o resto do sistema funciona sem isso)
- Docker (opcional — só necessário para subir o microserviço `rembg` usado
  no tratamento de foto por IA; sem ele, tudo o resto do sistema funciona
  normalmente, e as operações de tratamento que não envolvem remover fundo
  continuam disponíveis)
- Uma chave de API da Anthropic (opcional — só necessária para o
  tratamento de foto por IA; sem ela, a rota de preview retorna 503)

## Setup local

### 1. Instalar dependências

```bash
npm install
```

### 2. Subir um PostgreSQL local

Um `docker-compose.yml` na raiz sobe um Postgres dedicado ao projeto na porta
`5436` (escolhida para não colidir com outros Postgres já usados neste
ambiente, incluindo o do projeto irmão `site-vendas-oleo` na 5434):

```bash
docker compose up -d db
```

Se preferir usar um Postgres já instalado na máquina, basta ajustar
`DATABASE_URL` no `.env` do backend de acordo.

### 3. Configurar variáveis de ambiente

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edite `backend/.env`:
- `DATABASE_URL` — já vem apontando para o Postgres do `docker-compose.yml`
  (porta 5436). Ajuste se estiver usando outro Postgres.
- `TEST_DATABASE_URL` — banco separado usado pelos testes de integração
  (veja [Testes](#testes)).
- `JWT_SECRET` — troque por um valor aleatório forte.
- `R2_*` — credenciais do Cloudflare R2 (opcional para rodar localmente sem
  testar upload de imagens; as rotas de upload retornam erro 503 se ausentes).
- `ANTHROPIC_API_KEY` — chave da API da Anthropic, necessária para o
  tratamento de foto por IA (opcional; a rota de preview retorna 503 se
  ausente). **Nunca commitar essa chave** — só existe em `backend/.env`
  (fora do controle de versão).
- `REMBG_SERVICE_URL` / `REMBG_SERVICE_SECRET` — endereço e segredo
  opcional do microserviço de remoção de fundo, ver
  [Tratamento de foto por IA](#tratamento-de-foto-por-ia).

### 4. Criar o banco de testes (uma vez)

```bash
docker exec site-pedras-preciosas-db psql -U postgres -c "CREATE DATABASE site_pedras_preciosas_test;"
```

### 5. Rodar a migration inicial

```bash
npm run prisma:migrate
```

Isso aplica a migration `init` (todas as tabelas: `AdminUser`, `Category`,
`Product`, `ProductImage`) no banco apontado por `DATABASE_URL`.

### 6. Popular dados de exemplo (seed)

```bash
npm run prisma:seed
```

Cria:
- Um admin: `admin@site-pedras-preciosas.com` / senha `admin123` (troque em
  produção — pode ser sobrescrito via `SEED_ADMIN_EMAIL` /
  `SEED_ADMIN_PASSWORD`)
- Três categorias de exemplo (Esmeralda, Ametista, Topázio), cada uma com um
  `attributeSchema` diferente (quilate, corte, origem, claridade, cor,
  certificado — conforme faz sentido para o tipo de pedra)
- Um produto de exemplo (peça única) em cada categoria

### 7. Rodar os projetos

Em dois terminais:

```bash
npm run dev:backend    # API em http://localhost:3334
npm run dev:frontend   # painel admin em http://localhost:5174
```

Acesse `http://localhost:5174`, faça login com o admin do seed e explore a
lista/formulário de produtos.

## Testes

```bash
npm run test:backend
```

Os testes de integração rodam contra `TEST_DATABASE_URL` (ou `DATABASE_URL`
se aquele não estiver definido) e limpam as tabelas antes de cada teste —
**nunca aponte `TEST_DATABASE_URL` para um banco com dados reais**. Lembre de
aplicar as migrations nesse banco também:

```bash
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy --schema backend/prisma/schema.prisma
```

(ou, de dentro de `backend/`, defina `DATABASE_URL` no shell antes de rodar
`npx prisma migrate deploy`.)

Cobertura atual: criação/listagem/edição/desativação/reativação de produtos
(incluindo peça única com `trackStock=false` e peça com estoque controlado
`trackStock=true`/`stockQty=1`), login de admin, o fluxo de atributos
flexíveis entre categorias diferentes, e a validação das 9 operações de
tratamento de foto (`backend/tests/imageOperations.test.ts`, testes
unitários puros, sem rede).

### Testes de integração reais (Claude API + rembg)

`backend/tests/imageTreatment.integration.test.ts` testa as rotas de
`imageTreatment.routes.ts` com chamadas de rede **de verdade** — uma
instrução real para a Claude API (`claude-haiku-4-5`) e uma remoção de fundo
real via microserviço `rembg`. Por consumir créditos da Anthropic e depender
de um serviço externo no ar, esse arquivo fica fora de `tests/**/*.test.ts`
(não roda com `npm run test:backend`) — só roda explicitamente:

```bash
npm run test:integration
```

Pré-requisitos antes de rodar:
- `ANTHROPIC_API_KEY` configurada em `backend/.env` — sem ela, o teste da
  Claude API é pulado (com aviso no console), não falha.
- Microserviço `rembg` no ar (`docker compose up -d rembg`) — sem ele, o
  teste de remoção de fundo é pulado (com aviso no console); o teste que
  verifica o comportamento com o serviço **fora** do ar sempre roda (não
  depende de nada estar de pé).
- Banco de teste migrado (`TEST_DATABASE_URL`, ver [Testes](#testes)).

Cobre: formato da resposta estruturada da Claude API para uma instrução
simples; remoção de fundo real via `rembg` (valida que o PNG retornado tem
canal alpha); fallback 503 da rota `/treatment/preview` quando
`ANTHROPIC_API_KEY` está ausente (sem chamar a IA); e erro tratado (502, sem
derrubar o backend) quando o `rembg` está inacessível.

## Modelo de dados — peça única

Diferença central em relação ao projeto irmão de óleo: lá o produto é
padronizado e repetível em estoque; aqui cada peça de pedra preciosa costuma
ser **um item único**.

- `Product.trackStock` (`Boolean`, default `false`) + `stockQty` (`Int?`,
  nulo quando `trackStock` é falso) — mesma mecânica do óleo, mas aqui o uso
  típico é `trackStock=false` (peça única, sem controle de quantidade) ou
  `trackStock=true` + `stockQty=1` quando o admin preferir controlar
  explicitamente a disponibilidade de uma peça unitária.
- `Product.attributes` (`Json`) guarda os campos técnicos variáveis por tipo
  de pedra (quilate, corte, origem, certificado/laudo gemológico, cor,
  claridade etc.) — livre por produto.
- `Category.attributeSchema` (`Json`) é um "esquema leve", não imposto pelo
  banco: `[{"key": "carat", "label": "Quilate", "type": "number"}, ...]`. O
  admin usa isso só para saber quais campos mostrar/pedir ao cadastrar um
  produto daquela categoria — o backend **não** rejeita atributos fora desse
  esquema, então adicionar um campo novo é só editar a categoria, sem deploy.
- Uma nova categoria de pedra = uma linha em `Category`, não uma migration.

## Cloudflare R2 — upload de imagens

O fluxo é por **URL assinada**: o backend nunca recebe o arquivo.

1. Frontend pede uma URL assinada: `POST /api/products/:id/images/presign`
2. Frontend faz `PUT` do arquivo direto para o R2 usando essa URL
3. Frontend confirma o upload: `POST /api/products/:id/images` (cria o
   registro `ProductImage` com a próxima posição disponível)

Para isso funcionar, o bucket R2 precisa de uma política de CORS liberando
`PUT` a partir da origem do frontend (`http://localhost:5174` em dev), e o
bucket precisa de um domínio público (customizado ou `*.r2.dev`) configurado
em `R2_PUBLIC_URL`.

## Tratamento de foto por IA

O admin pode pedir, em texto livre, um tratamento pontual numa foto já
cadastrada (ex: "remove o fundo e deixa mais nítida") a partir do painel de
edição de produto. **Nada é automático** — o tratamento só roda quando o
admin explicitamente escreve o pedido e clica em "Aplicar"; nenhum
processamento acontece no upload ou em qualquer outro fluxo.

### Como funciona

1. O texto do admin **nunca é executado diretamente**. Ele é enviado para a
   Claude API (`claude-haiku-4-5`) junto com uma lista fechada de 9
   operações permitidas (`resize`, `crop`, `brightness`, `contrast`,
   `sharpen`, `rotate`, `compress`, `convertFormat`, `removeBackground`). A
   IA é obrigada a responder via tool use (JSON estruturado, nunca texto
   livre) com uma lista ordenada de operações dessa lista — ou marcar o
   pedido como pouco claro (`unclear`) e sugerir uma reformulação, sem
   inventar nada fora da lista. Pedidos compostos (como o exemplo acima) viram
   duas operações em sequência (`removeBackground` + `sharpen`).
2. O backend **valida de novo** cada operação recebida da IA (`backend/src/lib/imageOperations.ts`)
   antes de executar qualquer coisa — tipo de operação precisa estar na
   lista fechada, valores dentro dos ranges definidos. Qualquer coisa fora
   disso é rejeitada.
3. As 8 operações que não são remoção de fundo rodam com
   [Sharp](https://sharp.pixelplumbing.com/) no próprio backend Node. A
   operação `removeBackground` é enviada para o microserviço Python `rembg`
   (self-hosted, sem custo por imagem).
4. O resultado é salvo como um objeto novo no R2 (preview) — a imagem do
   produto só é alterada quando o admin confirma o preview no painel. O
   admin pode confirmar, descartar a prévia, ou desfazer o último
   tratamento confirmado (a versão anterior fica em
   `ProductImage.previousUrl`/`previousKey`, um único nível de undo).

Rotas (protegidas por `requireAuth`, mesmo padrão do resto da API):

```
POST /api/products/:productId/images/:imageId/treatment/preview   { instruction }
POST /api/products/:productId/images/:imageId/treatment/confirm   { previewUrl, previewKey }
POST /api/products/:productId/images/:imageId/treatment/discard   { previewKey }
POST /api/products/:productId/images/:imageId/undo
```

### Subindo o microserviço `rembg` localmente

Docker é a forma recomendada — isola as dependências Python (rembg, modelos
de segmentação, onnxruntime) do restante do projeto, que é 100% Node:

```bash
docker compose up -d rembg
```

Isso builda a imagem a partir de `rembg-service/Dockerfile` e sobe o serviço
em `http://localhost:8001` — que já é o valor default de
`REMBG_SERVICE_URL` no `backend/.env.example`. Alternativa sem
`docker-compose` (mesmo resultado):

```bash
cd rembg-service
docker build -t site-pedras-preciosas-rembg .
docker run -p 8001:8001 -e REMBG_SERVICE_SECRET="" site-pedras-preciosas-rembg
```

`REMBG_SERVICE_SECRET` é opcional — se definida (dos dois lados, backend e
serviço), o backend envia esse valor no header `X-Internal-Secret` e o
microserviço rejeita requisições sem o valor correto. Em desenvolvimento
local, sem tráfego externo chegando na porta `8001`, deixar vazia é
suficiente.

O primeiro download do modelo de segmentação usado pelo `rembg` pode demorar
(baixa um modelo ONNX na primeira chamada). Chamadas seguintes reusam o
modelo já baixado dentro do container.

### Limitações conhecidas

- Ao confirmar um tratamento, o objeto R2 anterior **não é apagado** — é o
  que permite o "desfazer". Isso significa que tratamentos sucessivos numa
  mesma imagem deixam objetos órfãos no bucket, sem limpeza automática
  ainda (fica para uma fase futura).
- Correção automática de cor **está fora de escopo** deliberadamente — a
  precisão de cor de uma pedra preciosa é sensível demais para IA
  generativa/heurística. Oriente o cliente a fotografar com **luz neutra**
  (evitar luz amarela/incandescente ou muito azulada) em vez de depender de
  processamento de cor por software.
- Upscaling ou geração de detalhe via IA generativa também está fora de
  escopo (custo não justificado para o tamanho deste projeto).

## Nota sobre identidade visual

Por pedido do cliente, esta fase **não** implementa identidade visual —
marca, paleta de cores, logo. O painel usa Tailwind CSS padrão (paleta
`slate` neutra), sem tema customizado. Isso é deliberado, não um
esquecimento: a marca da empresa ainda pode mudar. Quando a identidade for
definida, aplicar o tema é uma mudança isolada de CSS/Tailwind config, sem
impacto na estrutura de dados ou na API.

## Regras do projeto

- **Nunca** `prisma db push` em produção — sempre `prisma migrate dev` (dev) /
  `prisma migrate deploy` (produção).
- **Nunca** commitar `.env` (só `.env.example`).
- Timestamps sempre em UTC no banco; a conversão para horário de Brasília
  (BRT) é responsabilidade do frontend na exibição — ainda não implementada
  nesta fase (ver abaixo).
- Prisma sempre na versão `5.22.0`.

## O que foi construído nesta fase

- Monorepo (`npm workspaces`) com backend e frontend
- Schema Prisma com `Product`, `Category`, `ProductImage`, `AdminUser` —
  modelo de atributos flexível via JSON, sem necessidade de migration por
  tipo de pedra; `Product` modelado para peça única (`trackStock` opcional)
- Autenticação de admin via JWT (`POST /api/auth/login`) — painel sem link
  público, protegido em frontend (`ProtectedRoute`) e API (`requireAuth`)
- CRUD de produtos: criar, listar (com filtro por categoria e status),
  buscar por id, editar, desativar/reativar
- CRUD leve de categorias (criar, listar, editar `attributeSchema`)
- Upload de imagens via URL assinada do R2, com reordenação (`position`) e
  exclusão
- Tratamento de foto sob demanda por IA (Claude Haiku 4.5 + Sharp + `rembg`)
  — nunca automático, sempre via pedido explícito do admin, com preview
  antes de salvar e undo de um nível (ver
  [Tratamento de foto por IA](#tratamento-de-foto-por-ia))
- Painel admin (React): login, lista de produtos, formulário de
  criação/edição com campos dinâmicos por categoria, upload/reordenação de
  fotos — visual neutro, sem identidade de marca
- Testes de integração (Vitest + Supertest) cobrindo produtos (incluindo
  peça única vs. peça com estoque controlado), auth e o fluxo de atributos
  flexíveis
- `docker-compose.yml` para subir um Postgres local dedicado ao projeto

## O que falta para a próxima fase

- Identidade visual/tema de marca (aguardando definição do cliente)
- Vitrine pública (loja) — listagem e página de produto voltadas ao cliente
  final
- Carrinho de compras
- Checkout e integração com gateway de pagamento
- Cálculo de frete
- Emissão de nota fiscal (NF-e)
- Cadastro e login de cliente final (hoje só existe login de admin)
- Exibição de timestamps em horário de Brasília no frontend (hoje a API
  retorna UTC cru; a conversão para BRT na exibição fica para quando houver
  telas voltadas ao cliente final)
- Deploy real em Railway (backend/DB) e Vercel (frontend) — infraestrutura
  ainda não configurada, só prevista no design

## Problemas conhecidos

- `npm audit` pode apontar vulnerabilidades em dependências de terceiros
  (ex: `react-router-dom`, open redirect) sem correção disponível ainda
  dentro da faixa usada aqui. Não afeta o painel admin (uso interno, sem
  redirects vindos de input de usuário), mas vale revisar ao atualizar
  dependências — rode `npm audit` para o estado atual.
