import { beforeEach, describe, expect, it } from "vitest";
import { MercadoLivreApiError } from "../src/lib/mercadoLivre/httpBase";
import { FakeMercadoLivrePublisherClient } from "../src/lib/mercadoLivre/publisherClient";
import type { MercadoLivreItemPayload } from "../src/lib/mercadoLivre/publisherPayload";

function payload(overrides: Partial<MercadoLivreItemPayload> = {}): MercadoLivreItemPayload {
  return {
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
    ...overrides,
  };
}

describe("FakeMercadoLivrePublisherClient", () => {
  let client: FakeMercadoLivrePublisherClient;

  beforeEach(() => {
    client = new FakeMercadoLivrePublisherClient();
  });

  it("createItem: devolve id/permalink e guarda o item em memória, sem nenhuma chamada de rede", async () => {
    const created = await client.createItem("acc-1", payload());
    expect(created.id).toMatch(/^FAKE-ITEM-/);
    expect(created.permalink).toContain(created.id);
    expect(client.items.get(created.id)?.status).toBe("active");
  });

  it("updateItemStatus: altera o status do item existente", async () => {
    const created = await client.createItem("acc-1", payload());
    await client.updateItemStatus("acc-1", created.id, "paused");
    expect(client.items.get(created.id)?.status).toBe("paused");
  });

  it("updateItemStatus: lança 404 para item inexistente", async () => {
    await expect(client.updateItemStatus("acc-1", "NAO-EXISTE", "paused")).rejects.toMatchObject({ status: 404 });
  });

  it("setItemDescription: grava o texto no item existente", async () => {
    const created = await client.createItem("acc-1", payload());
    await client.setItemDescription("acc-1", created.id, "Nova descrição.");
    expect(client.items.get(created.id)?.description).toBe("Nova descrição.");
  });

  it("findItemsBySku: encontra pelo seller_custom_field (SKU) usado no createItem", async () => {
    const created = await client.createItem("acc-1", payload({ seller_custom_field: "ESM-001" }));
    const found = await client.findItemsBySku("acc-1", "ESM-001");
    expect(found).toEqual([
      { id: created.id, permalink: created.permalink, status: "active", sellerCustomField: "ESM-001" },
    ]);
  });

  it("findItemsBySku: devolve vazio para SKU sem nenhum item", async () => {
    await client.createItem("acc-1", payload({ seller_custom_field: "OUTRO-SKU" }));
    expect(await client.findItemsBySku("acc-1", "ESM-001")).toEqual([]);
  });

  describe("injeção de erros (queueFailure)", () => {
    it("rate_limited: createItem lança MercadoLivreApiError 429", async () => {
      client.queueFailure("createItem", { type: "rate_limited" });
      await expect(client.createItem("acc-1", payload())).rejects.toMatchObject({ status: 429 });
    });

    it("server_error: updateItemStatus lança MercadoLivreApiError 500", async () => {
      const created = await client.createItem("acc-1", payload());
      client.queueFailure("updateItemStatus", { type: "server_error" });
      await expect(client.updateItemStatus("acc-1", created.id, "paused")).rejects.toMatchObject({ status: 500 });
    });

    it("token_revoked: setItemDescription lança MercadoLivreApiError 401", async () => {
      const created = await client.createItem("acc-1", payload());
      client.queueFailure("setItemDescription", { type: "token_revoked" });
      await expect(client.setItemDescription("acc-1", created.id, "x")).rejects.toMatchObject({ status: 401 });
    });

    it("invalid_attribute: createItem lança MercadoLivreApiError 400 com a mensagem informada", async () => {
      client.queueFailure("createItem", { type: "invalid_attribute", message: "category_id inválido para o tipo de anúncio" });
      await expect(client.createItem("acc-1", payload())).rejects.toMatchObject({
        status: 400,
        message: "category_id inválido para o tipo de anúncio",
      });
    });

    it("erro injetado vale só para a PRÓXIMA chamada — a chamada seguinte volta ao normal", async () => {
      client.queueFailure("createItem", { type: "rate_limited" });
      await expect(client.createItem("acc-1", payload())).rejects.toThrow(MercadoLivreApiError);
      const created = await client.createItem("acc-1", payload());
      expect(created.id).toMatch(/^FAKE-ITEM-/);
    });

    it("timeout_item_created: createItem lança erro de timeout (status 0) MAS o item fica registrado — findItemsBySku encontra depois", async () => {
      client.queueFailure("createItem", { type: "timeout_item_created", mlItemId: "MLB999999" });

      await expect(client.createItem("acc-1", payload({ seller_custom_field: "ESM-001" }))).rejects.toMatchObject({ status: 0 });

      // A chamada "falhou" (quem chamou nunca viu o id) — só a reconciliação
      // por SKU recupera o item órfão.
      const found = await client.findItemsBySku("acc-1", "ESM-001");
      expect(found).toEqual([{ id: "MLB999999", permalink: expect.stringContaining("MLB999999"), status: "active", sellerCustomField: "ESM-001" }]);
    });
  });
});
