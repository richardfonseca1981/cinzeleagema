import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./setup";
import { prisma } from "../src/lib/prisma";
import { encryptToken } from "../src/lib/mercadoLivre/crypto";
import { RealMercadoLivrePublisherClient } from "../src/lib/mercadoLivre/publisherClient";
import type { MercadoLivreItemPayload } from "../src/lib/mercadoLivre/publisherPayload";

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

async function createAccount() {
  return prisma.mercadoLivreAccount.create({
    data: {
      mlUserId: "123",
      nickname: "LOJA_TESTE",
      accessToken: encryptToken("access-valido"),
      refreshToken: encryptToken("refresh-valido"),
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
      scope: "offline_access read write",
    },
  });
}

const payload: MercadoLivreItemPayload = {
  title: "Esmeralda Colombiana 2.3ct",
  category_id: "MLB123456",
  price: 1500,
  currency_id: "BRL",
  available_quantity: 1,
  buying_mode: "buy_it_now",
  listing_type_id: "gold_special",
  condition: "new",
  pictures: [{ source: "https://r2.example/esm-1.webp" }],
  seller_custom_field: "ESM-001",
};

beforeEach(async () => {
  await prisma.mercadoLivreListing.deleteMany();
  await prisma.mercadoLivreAccount.deleteMany();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RealMercadoLivrePublisherClient", () => {
  it("createItem: um único POST em sucesso, devolve id/permalink", async () => {
    const account = await createAccount();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: "MLB111", permalink: "https://produto.mercadolivre.com.br/MLB111" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RealMercadoLivrePublisherClient();
    const created = await client.createItem(account.id, payload);

    expect(created).toEqual({ id: "MLB111", permalink: "https://produto.mercadolivre.com.br/MLB111" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.mercadolibre.com/items");
    expect(init.method).toBe("POST");
  });

  it("createItem: 429 NÃO dispara segunda chamada — nunca retry automático em POST /items", async () => {
    const account = await createAccount();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, { message: "rate limited" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RealMercadoLivrePublisherClient();
    await expect(client.createItem(account.id, payload)).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("createItem: 500 NÃO dispara segunda chamada — mesmo comportamento do 429", async () => {
    const account = await createAccount();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { message: "internal error" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RealMercadoLivrePublisherClient();
    await expect(client.createItem(account.id, payload)).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("updateItemStatus: 500 também não retenta (mesma proteção do createItem)", async () => {
    const account = await createAccount();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { message: "internal error" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RealMercadoLivrePublisherClient();
    await expect(client.updateItemStatus(account.id, "MLB111", "paused")).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("createItem: em 401, ainda renova o token uma vez e repete a chamada original (lógica de refresh é separada do retry de 429/5xx)", async () => {
    const account = await createAccount();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "invalid token" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "access-renovado",
          refresh_token: "refresh-renovado",
          expires_in: 21600,
          scope: "offline_access read write",
          token_type: "bearer",
          user_id: 123,
        })
      )
      .mockResolvedValueOnce(jsonResponse(201, { id: "MLB111", permalink: "https://produto.mercadolivre.com.br/MLB111" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RealMercadoLivrePublisherClient();
    const created = await client.createItem(account.id, payload);

    expect(created.id).toBe("MLB111");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("findItemsBySku: GET mantém o retry padrão em 5xx (idempotente, sem o risco do POST/PUT)", async () => {
    const account = await createAccount();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { message: "internal error" }))
      .mockResolvedValueOnce(jsonResponse(200, { results: ["MLB111"] }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RealMercadoLivrePublisherClient();
    const found = await client.findItemsBySku(account.id, "ESM-001");

    expect(found).toEqual([{ id: "MLB111", permalink: "", status: "active", sellerCustomField: "ESM-001" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.mercadolibre.com/users/123/items/search?seller_sku=ESM-001");
  });
});
