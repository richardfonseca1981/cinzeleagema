# Runbook — ativar a integração com o Mercado Livre

Este documento é para o dia em que o app do Mercado Livre existir (hoje bloqueado
pelo cadastro no Mercado Pago — ver `CONTEXT.md`, seção "Mercado Livre"). Todo o
fluxo de publicação/pausa/encerramento/estoque/webhook já está implementado e
testado com um cliente **simulado** (nenhuma chamada real foi feita até hoje).
Este runbook é o caminho para ligar a API de verdade com o menor risco possível.

Siga os passos NA ORDEM. Cada um assume que o anterior já foi confirmado.

## 0. Antes de começar

- [ ] Confirme que a branch `feat/mercadolivre-integracao` (ou a que a sucedeu)
      já está em produção (deploy feito, migrações aplicadas via
      `prisma migrate deploy` — nunca `db push`).
- [ ] Confirme que `ML_PUBLISH_ENABLED` está `false` (ou ausente) em produção
      neste momento — é o estado seguro padrão.
- [ ] Separe pelo menos 1 peça real do catálogo para o teste do passo 7 — de
      preferência uma de valor baixo/médio e sem urgência de venda.

## 1. Criar o app no Mercado Livre

1. Acesse `developers.mercadolivre.com.br` já logado com a conta de vendedor
   real do cliente (não uma conta de teste) e crie uma aplicação nova.
2. **Redirect URI**: deve ser *idêntica* à que vai em `ML_REDIRECT_URI`
   (URL estática, sem query string variável) — aponta para o **frontend**, não
   para o backend:
   `https://admin.cinzeleagema.com.br/admin/mercadolivre/callback`
   (ver `frontend/src/pages/MercadoLivreCallback.tsx`).
3. **Escopos**: peça no mínimo `read` e `write` (leitura/escrita de itens e
   pedidos). `offline_access` é necessário para o `refresh_token` de longa
   duração — sem ele a conexão expiraria em poucas horas e exigiria reconectar
   toda vez.
4. Anote o `App ID` e o `Client Secret` gerados — vão para `ML_APP_ID` e
   `ML_CLIENT_SECRET` no passo 2. Nunca commitar esses valores no repositório.

## 2. Variáveis de ambiente na Railway

Adicione no painel da Railway (serviço do backend), **com
`ML_PUBLISH_ENABLED=false`** mesmo depois de preencher as demais — isso é o
kill switch global: enquanto estiver `false`, toda tentativa de publicar cai em
dry-run automaticamente, mesmo com conta conectada e peça apta. Só mude para
`true` no passo 9, depois de validar tudo.

| Variável | Valor nesta etapa |
|---|---|
| `ML_APP_ID` | App ID gerado no passo 1 |
| `ML_CLIENT_SECRET` | Client Secret gerado no passo 1 |
| `ML_REDIRECT_URI` | `https://admin.cinzeleagema.com.br/admin/mercadolivre/callback` |
| `ML_ENV` | `"test"` — use um [usuário de teste do Mercado Livre](https://developers.mercadolivre.com.br) (`POST /users/test_user`) primeiro; só troque para `"prod"` quando estiver confiante (ver passo 7) |
| `ML_TOKEN_ENC_KEY` | gere com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` — EXATAMENTE 32 bytes em base64, nunca reaproveitar de outro ambiente |
| `ML_PUBLISH_ENABLED` | `"false"` — **só mude no passo 9** |
| `ML_LISTING_TYPE_ID` | deixe vazio até confirmar o passo 5 (publicar com o tipo errado tem custo real) |
| `PUBLIC_SITE_URL` | já deve estar configurada (usada pelo sitemap e pela auditoria) — confirme que é `https://www.cinzeleagema.com.br` |

As demais `ML_PACKAGE_*` (presets de caixa) já têm default conservador no
código — só sobrescreva se as medidas reais das caixas do cliente (passo 6)
forem diferentes. Confira a lista completa em `backend/.env.example`.

## 3. Conectar a conta

1. Faça login no admin (`/admin`) com um usuário real.
2. Abra a seção "Mercado Livre" na sidebar, clique em "Conectar com o Mercado
   Livre" e autorize com a conta de vendedor (ou a conta de teste, se
   `ML_ENV="test"`).
3. Confirme que a tela volta mostrando "Conectado", nickname e validade do
   token. Se cair em erro, veja os logs do backend — a causa mais comum é
   `ML_REDIRECT_URI` não bater exatamente com a cadastrada no passo 1.

## 4. Confirmar a categoria real

A categoria usada até hoje (`backend/src/lib/mercadoLivre/categoryFixture.ts`,
`GEMSTONE_CATEGORY_FIXTURE`) é um **placeholder nunca confirmado** — os
endpoints públicos de categoria devolveram 403 anti-bot em toda tentativa
durante o desenvolvimento. Com a conta já conectada (passo 3), você tem acesso
autenticado:

1. Use a trilha já identificada como ponto de partida ("Joias e Relógios >
   Pedras Preciosas > Gemas Brutas") e confirme o id numérico real via
   `GET /sites/MLB/domain_discovery/search?q=pedra+preciosa` ou navegando a
   árvore com `GET /categories/{id}`, autenticado com o token da conta.
2. Depois de ter o id real, confirme os atributos obrigatórios dessa
   categoria: `GET /categories/{id}/attributes`.

## 5. Confirmar `listing_type_id` e as taxas reais

1. `listing_type_id` depende do **plano de anúncio contratado** pelo vendedor
   (ex.: `"gold_special"` é só um exemplo não verificado usado nos testes) —
   confirme no painel de vendas do Mercado Livre qual plano está ativo.
2. Confirme comissão, tarifa fixa e custo de frete (Mercado Envios) reais —
   os valores usados até hoje (comissão 12,5%, tarifa fixa R$6, frete R$25)
   são estimativas de terceiros/ponto de partida, nunca a tarifa oficial
   (`backend/src/lib/mercadoLivre/priceCalculator.ts`,
   `UNVERIFIED_DEFAULT_*`). Atualize essas constantes se os valores reais
   forem diferentes.
3. Confirme o formato de `shipping.dimensions` que a API espera — o código
   assume a string `"LxWxHcm,pesoGg"` (`publisherPayload.ts`), nunca
   confirmado contra a documentação.

## 6. Confirmar as caixas de embalagem reais

Os presets de caixa (`backend/src/lib/mercadoLivre/packagePresets.ts`,
variáveis `ML_PACKAGE_*`) são um ponto de partida conservador, não medidas
reais. Meça as caixas que o cliente tem à mão (P/M/G/GG) e ajuste as
variáveis de ambiente se divergirem. Para peças excepcionais (fora de todos
os presets), existe o override manual por peça (campo "Embalagem para
Mercado Livre" no formulário de produto) — confirme que
`ML_PACKAGE_OVERRIDE_MAX_DIMENSION_CM`/`ML_PACKAGE_OVERRIDE_MAX_WEIGHT_G`
cobrem os casos excepcionais reais do catálogo (obeliscos/capelas grandes).

## 7. Trocar o fixture de categoria no código

Depois de confirmar o id real (passo 4), edite
`backend/src/lib/mercadoLivre/categoryFixture.ts`:

```ts
export const GEMSTONE_CATEGORY_FIXTURE: MercadoLivreCategoryFixture = {
  id: "MLB<id real confirmado>",
  breadcrumb: [...], // atualize se a trilha real for diferente
  verified: true,     // false bloqueia TODA publicação real — só true depois do passo 4
};
```

Comitar e dar deploy dessa mudança **antes** do passo 8 — enquanto
`verified: false`, `assertReadyToPublish` bloqueia qualquer publicação real
(dry-run continua funcionando normalmente, sem essa checagem).

## 8. Publicar 1 peça de teste

1. Ainda com `ML_PUBLISH_ENABLED=false`: abra a peça separada no passo 0 na
   tela "Mercado Livre" do admin, gere a prévia (dry-run) e confira o
   payload completo (título, descrição, preço, categoria, embalagem) —
   nada é enviado ao Mercado Livre neste momento, mesmo pedindo "publicar"
   (a flag força dry-run e avisa com `forcedDryRun: true`).
2. Corrija qualquer pendência mostrada em `issues` (categoria/embalagem).
3. Mude `ML_PUBLISH_ENABLED` para `"true"` **só na Railway de
   homologação/teste**, se houver uma — se não houver, pule direto para
   produção com atenção redobrada, publicando só esta 1 peça de teste.
4. Clique em "Publicar (real)" e confirme. Se a resposta for 502 (timeout
   ambíguo), **não publique de novo às pressas** — rode a reconciliação
   (botão/rota `POST /reconcile/:productId`) primeiro, que verifica por SKU
   se o Mercado Livre já criou o item do outro lado antes de tentar de novo.

## 9. Conferir

- [ ] O anúncio aparece no painel de vendas do Mercado Livre, com título,
      preço, fotos, descrição e categoria corretos.
- [ ] O link (`permalink` devolvido pela API) abre a página pública do
      anúncio normalmente.
- [ ] O preço de anúncio bate com o esperado (base + markup da conta,
      `MercadoLivreAccount.markupPct`).
- [ ] As dimensões/peso do pacote declaradas batem com a caixa real.

## 10. Pausar/encerrar o teste

- **Pausar** (`POST /listings/:productId/pause`): reversível, pode reativar
  depois. Use isto para o teste, não "Encerrar".
- **Encerrar** (`POST /listings/:productId/close`): **IRREVERSÍVEL** — o
  anúncio nunca pode ser reaberto no Mercado Livre. Só use se tiver certeza
  de que não vai mais precisar deste anúncio de teste. Exige digitar a
  palavra de confirmação `ENCERRAR`.

## 11. Ligar `ML_PUBLISH_ENABLED` de verdade

Depois do teste do passo 8-10 validado:

1. Mude `ML_PUBLISH_ENABLED` para `"true"` na Railway de produção.
2. Avise o Felipe/cliente antes — a partir daqui, qualquer "Publicar (real)"
   no admin passa a criar anúncios de verdade, com custo real (tarifas/
   exposição).
3. Publique as peças reais uma a uma (não existe publicação em lote, por
   design) e confira o painel do admin "Pendências" (`/admin/mercadolivre`,
   seção Pendências) periodicamente — ela agrega pausas pendentes, anúncios
   presos em "publicando" e eventos de webhook com erro.

## 12. Configurar a notificação do webhook

No painel do Mercado Livre (seção "Notificações" da aplicação), cadastre a
URL pública:

```
https://<URL de produção do backend>/api/webhooks/mercadolivre
```

Esta rota é **pública de propósito** (o Mercado Livre não autentica como um
admin) — a única defesa é checar que o `user_id` da notificação bate com o da
conta conectada, mais um rate limit por IP. Depois de cadastrar, o comportamento
de "pedido pago → marcar vendida automaticamente" passa a valer de verdade.
Monitore `/admin/mercadolivre` (seção Pendências → "Eventos de webhook com
erro") nos primeiros dias — qualquer suposição errada sobre o formato do
corpo (ver checklist abaixo) vai aparecer como `lastError` ali, nunca como uma
falha silenciosa.

## 13. Plano de rollback / kill switch

| Situação | Ação |
|---|---|
| Algo deu errado numa publicação específica | Pausar o anúncio (`/listings/:productId/pause`) — reversível, nunca remove o anúncio |
| Suspeita de bug ativo, parar TUDO imediatamente | `ML_PUBLISH_ENABLED=false` na Railway — kill switch global, força dry-run em qualquer publicação/reativação nova; **pausar/encerrar continuam liberados mesmo com a flag `false`** (são ações de segurança, nunca bloqueadas) |
| Preciso desfazer uma conexão de conta | "Desconectar" na tela admin — remove o token salvo, nunca afeta anúncios já publicados no Mercado Livre |
| Preciso parar TODOS os anúncios ativos de uma vez | Botão "Pausar todos os anúncios" (`/listings/pause-all`) — exige confirmação forte, processa um por vez, nunca para no meio por um erro isolado |
| Marcar vendida por engano | `POST /:id/unmark-sold` — reativa a peça no site, mas **nunca** reativa o anúncio ML sozinho (fica pausado até reativação manual consciente) |
| Webhook causando ruído/erro em massa | Remover a URL de notificação no painel do Mercado Livre (reverte o passo 12) — o endpoint continua existindo, só para de receber tráfego |

Não existe rollback de código específico para esta feature — ela é
inteiramente controlada por `ML_PUBLISH_ENABLED` e pela conexão da conta, sem
migração destrutiva alguma (todas as migrações desta integração são aditivas).

---

## Checklist consolidada — tudo que é suposição não verificada hoje

Nada abaixo foi confirmado contra a API/documentação real do Mercado Livre —
em todo o desenvolvimento, as tentativas de consultar a documentação oficial
retornaram 403 `PA_UNAUTHORIZED_RESULT_FROM_POLICIES` (bloqueio anti-bot).
Confirme cada item à medida que for avançando pelos passos acima; o código já
foi escrito para falhar de forma visível (nunca em silêncio) quando a
suposição estiver errada.

**Categoria e atributos**
- [ ] Id real da categoria (`categoryFixture.ts`) — passo 4.
- [ ] Atributos obrigatórios por categoria (`GET /categories/{id}/attributes`).
- [ ] `listing_type_id` correto para o plano contratado — passo 5.

**Payload de publicação (`POST /items`)**
- [ ] Campo exato do SKU: assumido `seller_custom_field`.
- [ ] Formato de `shipping.dimensions`: assumido `"LxWxHcm,pesoGg"`.
- [ ] Formato de `POST /items/{id}/description`: assumido `{ plain_text }`.
- [ ] Limite real de caracteres da descrição: hoje configurável via
      `ML_DESCRIPTION_MAX_CHARS` (default 5000), sem confirmação.

**Taxas e preço**
- [ ] Comissão real (hoje estimativa 12,5%).
- [ ] Tarifa fixa real (hoje estimativa R$6).
- [ ] Custo de frete/Mercado Envios real (hoje estimativa R$25).

**Embalagem**
- [ ] Dimensões reais das caixas P/M/G/GG do cliente.
- [ ] Tetos do override manual (`ML_PACKAGE_OVERRIDE_MAX_DIMENSION_CM`=100cm,
      `ML_PACKAGE_OVERRIDE_MAX_WEIGHT_G`=30000g) — nenhuma medida excepcional
      real (obelisco/capela grande) foi confirmada ainda.
- [ ] Override manual não tem validação cruzada contra peso/tamanho real da
      peça — responsabilidade inteiramente do admin que digita a medida.

**Ciclo de vida do anúncio**
- [ ] `PUT /items/{id}` com `status: "closed"` é realmente irreversível na
      prática (suposição, baseada em comportamento histórico documentado).
- [ ] `PUT /items/{id}` com `status: "active"` reabre um anúncio pausado só
      com o campo `status`, sem exigir re-validação de categoria/atributos.
- [ ] Formato de `GET /items/{id}` (`id`/`status`/`permalink`).
- [ ] `findItemsBySku` devolvendo MAIS DE UM resultado (409, candidatos
      devolvidos) não tem nenhuma rota para o admin resolver manualmente
      ainda — só acontece se isso de fato ocorrer na prática.

**Estoque / "marcar vendida"**
- [ ] Canal `"mercadolivre"` assume que o próprio Mercado Livre
      pausa/encerra o anúncio do lado dele quando a venda acontece lá — se
      isso for falso, o anúncio local ficaria "active" enquanto o item real
      já foi vendido, até rodar `/listings/:productId/sync` manualmente ou o
      webhook confirmar.
- [ ] "Pausa pendente" só é visível olhando o `lastError` de cada anúncio
      (prefixo `"pause_pending: "`) — não existe tela dedicada para listar
      todos de uma vez (o painel "Pendências" já ajuda, mas não é uma lista
      exaustiva automática).

**Webhook**
- [ ] Formato do corpo da notificação: nomes de campo `topic`/`resource`/
      `user_id` (formato histórico, nunca confirmado).
- [ ] Lista completa de tópicos existentes — só `orders_v2` e `items` têm
      tratamento especial; outros nomes cairiam em "desconhecido, ignorado".
- [ ] Formato de `resource` como `"/orders/{id}"` / `"/items/{id}"`.
- [ ] Formato de `GET /orders/{id}` e nome do campo do SKU no item do
      pedido: assumido `seller_custom_field` (pode ser `seller_sku` ou
      outro).
- [ ] Lista completa de status de pedido — só `"paid"`/`"cancelled"` têm
      tratamento especial.
- [ ] Janela de retry do Mercado Livre para notificações sem 200 rápido.
- [ ] Mecanismo de assinatura/autenticação da notificação (HMAC, header
      customizado) — hoje a única defesa é checar `user_id` contra a conta
      conectada, sem garantia criptográfica de origem.

**Scripts somente leitura**
- [ ] `audit:mercadolivre`, `generate:ml-titles`, `simulate:mercadolivre`
      ainda não foram rodados contra o banco de produção (ficam para o
      operador decidir quando, via TCP Proxy temporário da Railway — ver
      `CONTEXT.md`, seção "Mercado Livre — Fase 1A", "Rodar contra
      produção").
