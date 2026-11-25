import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";
import { parseCsv } from "../src/lib/csv";

const app = createApp();
const token = generateTestToken();

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("GET /api/admin/products/category-export.csv", () => {
  it("exige token", async () => {
    await request(app).get("/api/admin/products/category-export.csv").expect(401);
  });

  it("devolve CSV com BOM e os dados reais de categoria/subcategoria", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const sub = await prisma.subcategory.create({ data: { name: "Ametistas", slug: "ametistas", position: 0, categoryId: category.id } });
    await prisma.product.create({ data: { name: "Ametista Bruta", slug: "ametista-bruta", sku: "SKU-1", categoryId: category.id, subcategoryId: sub.id } });
    await prisma.product.create({ data: { name: "Sem Categoria", slug: "sem-categoria" } });

    const res = await request(app)
      .get("/api/admin/products/category-export.csv")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text.charCodeAt(0)).toBe(0xfeff);

    const rows = parseCsv(res.text);
    expect(rows[0]).toEqual(["id", "sku", "nome", "categoria", "subcategoria"]);
    const withCategory = rows.find((r) => r[2] === "Ametista Bruta");
    expect(withCategory).toEqual([withCategory![0], "SKU-1", "Ametista Bruta", "Big", "Ametistas"]);
    const withoutCategory = rows.find((r) => r[2] === "Sem Categoria");
    expect(withoutCategory).toEqual([withoutCategory![0], "", "Sem Categoria", "", ""]);
  });
});
