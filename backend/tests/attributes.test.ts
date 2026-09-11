import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";

const app = createApp();
const token = generateTestToken();

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("Flexible product attributes across categories", () => {
  it("allows different gemstone categories to accept entirely different attribute keys without a migration", async () => {
    const esmeralda = await prisma.category.create({
      data: {
        name: "Esmeralda",
        slug: "esmeralda",
        attributeSchema: [
          { key: "carat", label: "Quilate", type: "number" },
          { key: "clarity", label: "Claridade", type: "text" },
        ],
      },
    });

    const ametista = await prisma.category.create({
      data: {
        name: "Ametista",
        slug: "ametista",
        attributeSchema: [
          { key: "carat", label: "Quilate", type: "number" },
          { key: "color", label: "Cor", type: "text" },
        ],
      },
    });

    const esmeraldaRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Esmeralda Colombiana",
        slug: "esmeralda-colombiana",
        categoryId: esmeralda.id,
        price: 8500,
        attributes: { carat: 2.3, clarity: "VS" },
      });

    const ametistaRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Ametista Uruguaia",
        slug: "ametista-uruguaia",
        categoryId: ametista.id,
        price: 620,
        attributes: { carat: 5, color: "Roxo profundo" },
      });

    expect(esmeraldaRes.status).toBe(201);
    expect(ametistaRes.status).toBe(201);

    expect(esmeraldaRes.body.attributes).toEqual({ carat: 2.3, clarity: "VS" });
    expect(ametistaRes.body.attributes).toEqual({ carat: 5, color: "Roxo profundo" });

    // Uma terceira pedra, com atributos totalmente novos, também deve
    // funcionar sem qualquer alteração de schema — só criando a categoria.
    const topazio = await prisma.category.create({
      data: {
        name: "Topázio",
        slug: "topazio",
        attributeSchema: [{ key: "origin", label: "Origem", type: "text" }],
      },
    });

    const topazioRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Topázio Imperial",
        slug: "topazio-imperial",
        categoryId: topazio.id,
        price: 4200,
        attributes: { origin: "Ouro Preto, MG" },
      });

    expect(topazioRes.status).toBe(201);
    expect(topazioRes.body.attributes).toEqual({ origin: "Ouro Preto, MG" });
  });

  it("stores category.attributeSchema as a soft hint, not an enforced constraint", async () => {
    const category = await prisma.category.create({
      data: {
        name: "Pedra Especial",
        slug: "pedra-especial",
        attributeSchema: [{ key: "carat", label: "Quilate", type: "number" }],
      },
    });

    // Envia um atributo que não está no attributeSchema declarado — deve
    // ser aceito mesmo assim, já que a validação é apenas orientativa para a UI.
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Pedra Especial Experimental",
        slug: "pedra-especial-experimental",
        categoryId: category.id,
        price: 199.9,
        attributes: { customField: "valor não previsto no schema" },
      });

    expect(res.status).toBe(201);
    expect(res.body.attributes).toEqual({ customField: "valor não previsto no schema" });
  });

  it("supports unique-piece products (trackStock=false) alongside categories that do track stock", async () => {
    const category = await prisma.category.create({
      data: { name: "Ametista", slug: "ametista-2", attributeSchema: [] },
    });

    const uniquePiece = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Peça única",
        slug: "peca-unica",
        categoryId: category.id,
        price: 500,
        trackStock: false,
      });

    expect(uniquePiece.status).toBe(201);
    expect(uniquePiece.body.trackStock).toBe(false);
    expect(uniquePiece.body.stockQty).toBeNull();
  });
});
