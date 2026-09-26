import { describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";

const app = createApp();

const validPayload = {
  customerName: "Maria Silva",
  customerPhone: "+55 14 99999-0000",
  items: [{ productId: "prod-1", name: "Ametista Uruguaia 5ct", quantity: 1, unitPrice: 620 }],
  totalEstimate: 620,
};

describe("Order routes", () => {
  it("returns delivered=false without requiring auth when FluxioDesk isn't configured", async () => {
    const res = await request(app).post("/api/orders").send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ delivered: false });
  });

  it("rejects an invalid payload", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send({ customerName: "", customerPhone: "", items: [], totalEstimate: -1 });

    expect(res.status).toBe(400);
  });
});
