import { prisma } from "../prisma";
import { mercadoLivreRequest } from "./client";
import { MercadoLivreApiError } from "./httpBase";
import type { MercadoLivreItemPayload } from "./publisherPayload";

export type MercadoLivreItemStatus = "active" | "paused" | "closed";

export interface MercadoLivreCreatedItem {
  id: string;
  permalink: string;
}

export interface MercadoLivreFoundItem {
  id: string;
  permalink: string;
  status: MercadoLivreItemStatus;
  sellerCustomField: string | null;
}

export interface MercadoLivreItemStatusInfo {
  id: string;
  status: MercadoLivreItemStatus;
  permalink: string;
}

// Porta (Fase 1B): toda chamada que cria/altera/consulta um anúncio no
// Mercado Livre passa por esta interface — o publisher, o webhook e os
// testes dependem desta abstração, nunca de RealMercadoLivrePublisherClient
// diretamente. accountId é sempre o id da MercadoLivreAccount conectada,
// nunca o id do item.
export interface MercadoLivrePublisherClient {
  createItem(accountId: string, payload: MercadoLivreItemPayload): Promise<MercadoLivreCreatedItem>;
  updateItemStatus(accountId: string, mlItemId: string, status: MercadoLivreItemStatus): Promise<void>;
  setItemDescription(accountId: string, mlItemId: string, text: string): Promise<void>;
  // Busca anúncios da conta por SKU do vendedor (mesmo campo — suposição —
  // usado em MercadoLivreItemPayload.seller_custom_field). Usada pela
  // rotina de reconciliação (etapa de publicação): depois de um erro/
  // timeout em createItem, procura se o Mercado Livre criou o item mesmo
  // assim, pra nunca deixar um anúncio órfão/duplicado.
  findItemsBySku(accountId: string, sku: string): Promise<MercadoLivreFoundItem[]>;
  // Fase 1B etapa 6 — lê o status atual do item diretamente no Mercado
  // Livre (GET idempotente, mantém o retry padrão). Usado pela rota de
  // sincronização: útil quando alguém pausa/reativa o anúncio direto no
  // painel do Mercado Livre, sem passar pelas rotas deste admin.
  getItem(accountId: string, mlItemId: string): Promise<MercadoLivreItemStatusInfo>;
}

// Implementação real. NENHUM teste automatizado chama isto de verdade —
// não há credenciais do Mercado Livre nesta fase (app bloqueado pelo
// cadastro no Mercado Pago, ver CONTEXT.md). Formato exato de cada endpoint
// abaixo é suposição não verificada: a doc oficial respondeu 403 anti-bot
// nas 3 tentativas de consulta feitas durante o planejamento desta fase,
// mesmo bloqueio já documentado em categoryFixture.ts.
export class RealMercadoLivrePublisherClient implements MercadoLivrePublisherClient {
  async createItem(accountId: string, payload: MercadoLivreItemPayload): Promise<MercadoLivreCreatedItem> {
    // maxRetries: 0 — nunca retry automático em POST /items (ver client.ts
    // MercadoLivreRequestOptions.maxRetries): um 429/5xx aqui pode
    // significar que o Mercado Livre já criou o item e só a resposta se
    // perdeu. Reconciliar por SKU depois de um erro é responsabilidade de
    // quem chama este método (rotina de publicação), nunca deste cliente.
    const res = await mercadoLivreRequest<{ id: string; permalink: string }>(accountId, "/items", {
      method: "POST",
      body: payload,
      maxRetries: 0,
    });
    return { id: res.data.id, permalink: res.data.permalink };
  }

  async updateItemStatus(accountId: string, mlItemId: string, status: MercadoLivreItemStatus): Promise<void> {
    // maxRetries: 0 — mesmo motivo do createItem: alterar status de um
    // anúncio existente não é seguro de tentar de novo sem saber se a
    // primeira chamada já aplicou.
    await mercadoLivreRequest(accountId, `/items/${mlItemId}`, {
      method: "PUT",
      body: { status },
      maxRetries: 0,
    });
  }

  async setItemDescription(accountId: string, mlItemId: string, text: string): Promise<void> {
    // SUPOSIÇÃO: endpoint historicamente público da API é
    // POST /items/{id}/description com { plain_text } — não confirmado
    // contra a doc atual.
    await mercadoLivreRequest(accountId, `/items/${mlItemId}/description`, {
      method: "POST",
      body: { plain_text: text },
      maxRetries: 0,
    });
  }

  async findItemsBySku(accountId: string, sku: string): Promise<MercadoLivreFoundItem[]> {
    // SUPOSIÇÃO FORTE, não verificada: busca por SKU do vendedor via
    // GET /users/{user_id}/items/search?seller_sku=... devolveria só uma
    // lista de ids, não o status/permalink completo — uma implementação
    // real precisaria de uma segunda chamada (ex.: GET /items?ids=...) pra
    // completar MercadoLivreFoundItem de verdade. Sem credenciais reais pra
    // confirmar esse formato, qualquer detalhe além do contrato da
    // interface seria adivinhação — por isso status/permalink abaixo são
    // PLACEHOLDERS: quem usa o resultado precisa buscar o item completo via
    // GET /items/{id} antes de confiar neles. GET mantém o retry padrão
    // (idempotente, sem o risco do POST/PUT acima).
    const account = await prisma.mercadoLivreAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error(`Conta do Mercado Livre não encontrada: ${accountId}`);

    const res = await mercadoLivreRequest<{ results: string[] }>(accountId, `/users/${account.mlUserId}/items/search`, {
      query: { seller_sku: sku },
    });

    return res.data.results.map((id) => ({ id, permalink: "", status: "active" as const, sellerCustomField: sku }));
  }

  async getItem(accountId: string, mlItemId: string): Promise<MercadoLivreItemStatusInfo> {
    // GET /items/{id} — endpoint público bem conhecido historicamente (get
    // por id é o caso mais básico de uma API REST), mas ainda assim NÃO
    // confirmado contra a doc atual (mesmo bloqueio 403, ver
    // categoryFixture.ts). Mantém o retry padrão (idempotente, sem o risco
    // do POST/PUT acima).
    const res = await mercadoLivreRequest<{ id: string; status: MercadoLivreItemStatus; permalink: string }>(
      accountId,
      `/items/${mlItemId}`
    );
    return { id: res.data.id, status: res.data.status, permalink: res.data.permalink };
  }
}

// Erros injetáveis pelo teste — mesmo "formato" de erro que
// RealMercadoLivrePublisherClient lançaria (MercadoLivreApiError com
// status), pra qualquer código que trate erro do publisher funcionar igual
// com o fake ou com o real.
export type FakePublisherFailure =
  | { type: "rate_limited" } // 429
  | { type: "server_error" } // 5xx
  | { type: "token_revoked" } // 401 persistente (mesmo depois de renovar — ver client.ts)
  | { type: "invalid_attribute"; message: string } // 4xx de validação (categoria/atributo rejeitado)
  | { type: "timeout_item_created"; mlItemId: string }; // nunca recebemos resposta, mas o Mercado Livre processou e criou o item — só reconciliação por SKU encontra depois

type FakePublisherMethod = "createItem" | "updateItemStatus" | "setItemDescription" | "findItemsBySku" | "getItem";

interface FakeItem {
  id: string;
  permalink: string;
  status: MercadoLivreItemStatus;
  sellerCustomField: string | null;
  description: string;
}

function throwFakeFailure(failure: FakePublisherFailure): never {
  switch (failure.type) {
    case "rate_limited":
      throw new MercadoLivreApiError("Too Many Requests", 429, null);
    case "server_error":
      throw new MercadoLivreApiError("Internal Server Error", 500, null);
    case "token_revoked":
      throw new MercadoLivreApiError("invalid_token", 401, null);
    case "invalid_attribute":
      throw new MercadoLivreApiError(failure.message, 400, null);
    case "timeout_item_created":
      // Mesmo formato de erro que fetchWithRetry lança quando a chamada de
      // rede falha em todas as tentativas (ver httpBase.ts) — status 0,
      // nenhuma resposta HTTP de verdade chegou.
      throw new MercadoLivreApiError("Falha ao chamar o Mercado Livre após tentativas de retry: timeout", 0, null);
  }
}

// Em memória — para testes e para o modo dry-run (ML_PUBLISH_ENABLED=false,
// ver lib/env.ts). Nunca faz nenhuma chamada de rede real.
export class FakeMercadoLivrePublisherClient implements MercadoLivrePublisherClient {
  readonly items = new Map<string, FakeItem>();
  private nextId = 1;
  private queuedFailures: Partial<Record<FakePublisherMethod, FakePublisherFailure>> = {};

  // Faz a PRÓXIMA chamada desse método falhar da forma descrita — consumido
  // uma única vez (a chamada seguinte já volta ao comportamento normal).
  queueFailure(method: FakePublisherMethod, failure: FakePublisherFailure): void {
    this.queuedFailures[method] = failure;
  }

  private takeFailure(method: FakePublisherMethod): FakePublisherFailure | undefined {
    const failure = this.queuedFailures[method];
    delete this.queuedFailures[method];
    return failure;
  }

  async createItem(_accountId: string, payload: MercadoLivreItemPayload): Promise<MercadoLivreCreatedItem> {
    const failure = this.takeFailure("createItem");
    if (failure) {
      if (failure.type === "timeout_item_created") {
        // O "servidor" processou e criou o item — só a resposta nunca
        // chegou até nós. findItemsBySku é o único jeito de descobrir isso
        // depois (ver reconciliação, etapa de publicação).
        this.items.set(failure.mlItemId, {
          id: failure.mlItemId,
          permalink: `https://produto.mercadolivre.com.br/${failure.mlItemId}`,
          status: "active",
          sellerCustomField: payload.seller_custom_field ?? null,
          description: "",
        });
      }
      throwFakeFailure(failure);
    }

    const id = `FAKE-ITEM-${this.nextId++}`;
    const permalink = `https://produto.mercadolivre.com.br/${id}`;
    this.items.set(id, { id, permalink, status: "active", sellerCustomField: payload.seller_custom_field ?? null, description: "" });
    return { id, permalink };
  }

  async updateItemStatus(_accountId: string, mlItemId: string, status: MercadoLivreItemStatus): Promise<void> {
    const failure = this.takeFailure("updateItemStatus");
    if (failure) throwFakeFailure(failure);

    const item = this.items.get(mlItemId);
    if (!item) throw new MercadoLivreApiError(`Item não encontrado: ${mlItemId}`, 404, null);
    item.status = status;
  }

  async setItemDescription(_accountId: string, mlItemId: string, text: string): Promise<void> {
    const failure = this.takeFailure("setItemDescription");
    if (failure) throwFakeFailure(failure);

    const item = this.items.get(mlItemId);
    if (!item) throw new MercadoLivreApiError(`Item não encontrado: ${mlItemId}`, 404, null);
    item.description = text;
  }

  async findItemsBySku(_accountId: string, sku: string): Promise<MercadoLivreFoundItem[]> {
    const failure = this.takeFailure("findItemsBySku");
    if (failure) throwFakeFailure(failure);

    return [...this.items.values()]
      .filter((item) => item.sellerCustomField === sku)
      .map((item) => ({ id: item.id, permalink: item.permalink, status: item.status, sellerCustomField: item.sellerCustomField }));
  }

  async getItem(_accountId: string, mlItemId: string): Promise<MercadoLivreItemStatusInfo> {
    const failure = this.takeFailure("getItem");
    if (failure) throwFakeFailure(failure);

    const item = this.items.get(mlItemId);
    if (!item) throw new MercadoLivreApiError(`Item não encontrado: ${mlItemId}`, 404, null);
    return { id: item.id, status: item.status, permalink: item.permalink };
  }
}
