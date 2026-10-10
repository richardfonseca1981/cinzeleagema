import { afterAll, beforeEach, describe, expect, it } from "vitest";
import "./setup";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase } from "./helpers";
import { baseSlugFor, generateUniqueSlug, slugify } from "../src/lib/productSlug";

describe("slugify", () => {
  it("lowercases, remove acentos e troca espaços/símbolos por hífen", () => {
    expect(slugify("Esmeralda Colombiana 2.3ct")).toBe("esmeralda-colombiana-2-3ct");
    expect(slugify("Água-Marinha  Única")).toBe("agua-marinha-unica");
  });
});

describe("baseSlugFor", () => {
  it("usa o nome quando houver", () => {
    expect(baseSlugFor("Ametista Bruta")).toBe("ametista-bruta");
  });

  it("gera um identificador quando não há nome (null, vazio ou só espaços)", () => {
    for (const name of [null, undefined, "", "   "]) {
      const slug = baseSlugFor(name);
      expect(slug).toMatch(/^peca-[a-z0-9]{10}$/);
    }
  });

  it("dois fallbacks sem nome nunca colidem entre si", () => {
    expect(baseSlugFor(null)).not.toBe(baseSlugFor(null));
  });
});

describe("generateUniqueSlug", () => {
  let categoryId: string;

  beforeEach(async () => {
    await cleanDatabase();
    const category = await prisma.category.create({ data: { name: "Homedecor", slug: "homedecor" } });
    categoryId = category.id;
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it("usa o slug base quando ele ainda não existe", async () => {
    const slug = await generateUniqueSlug("Topázio Imperial");
    expect(slug).toBe("topazio-imperial");
  });

  it("resolve colisão (dois nomes iguais) acrescentando -2, -3...", async () => {
    const first = await generateUniqueSlug("Ametista");
    await prisma.product.create({ data: { name: "Ametista", slug: first, categoryId } });

    const second = await generateUniqueSlug("Ametista");
    expect(second).toBe("ametista-2");
    await prisma.product.create({ data: { name: "Ametista", slug: second, categoryId } });

    const third = await generateUniqueSlug("Ametista");
    expect(third).toBe("ametista-3");
  });
});
