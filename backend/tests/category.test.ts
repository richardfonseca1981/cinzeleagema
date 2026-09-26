import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("Category routes", () => {
  it("lists categories with nested subcategories without requiring auth", async () => {
    const big = await prisma.category.create({ data: { name: "Big", slug: "big" } });
    await prisma.subcategory.create({ data: { name: "Ametistas", slug: "ametistas", categoryId: big.id } });
    await prisma.subcategory.create({ data: { name: "Calcitas", slug: "calcitas", categoryId: big.id } });
    await prisma.category.create({ data: { name: "Acessorios", slug: "acessorios" } });

    const res = await request(app).get("/api/categories");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const bigResult = res.body.find((c: { slug: string }) => c.slug === "big");
    expect(bigResult.subcategories.map((s: { slug: string }) => s.slug)).toEqual(["ametistas", "calcitas"]);

    const acessoriosResult = res.body.find((c: { slug: string }) => c.slug === "acessorios");
    expect(acessoriosResult.subcategories).toEqual([]);
  });
});
