import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./setup";
import { prisma } from "../src/lib/prisma";
import { categoryData, runSeed } from "../prisma/seedData";
import { runPromote, type Deps } from "../src/scripts/promoteFormasToCategory";
import { cleanDatabase } from "./helpers";
import { seedOldLayout } from "./formasFixture";

// O seed roda no banco de teste; o console é silenciado.
beforeEach(async () => {
  await cleanDatabase();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanDatabase();
  await prisma.$disconnect();
});

async function counts() {
  return {
    admins: await prisma.adminUser.count(),
    categories: await prisma.category.count(),
    subcategories: await prisma.subcategory.count(),
    products: await prisma.product.count(),
  };
}

describe("dados do seed", () => {
  it("6 categorias: Formas é categoria de nível 1 sem subcategorias; BIG tem 3; nenhuma subcategoria 'formas'", () => {
    expect(categoryData.map((c) => c.slug)).toEqual(["pedras-brutas", "pedras-polidas", "big", "formas", "homedecor", "acessorios"]);
    expect(categoryData.find((c) => c.slug === "formas")!.subcategories ?? []).toEqual([]);
    expect(categoryData.find((c) => c.slug === "big")!.subcategories!.map((s) => s.slug)).toEqual(["ametistas", "calcitas", "citrinos"]);
    const allSubs = categoryData.flatMap((c) => (c.subcategories ?? []).map((s) => s.slug));
    expect(allSubs).not.toContain("formas");
    expect(allSubs).toHaveLength(9);
  });
});

describe("runSeed (banco de teste real)", () => {
  it("cria 6 categorias nas posições 1–6, 9 subcategorias e os 3 produtos de exemplo", async () => {
    await runSeed(prisma);

    expect(await counts()).toEqual({ admins: 1, categories: 6, subcategories: 9, products: 3 });
    const categories = await prisma.category.findMany({ orderBy: { position: "asc" }, include: { subcategories: { orderBy: { position: "asc" } } } });
    expect(categories.map((c) => `${c.position}:${c.slug}:${c.subcategories.length}`)).toEqual([
      "1:pedras-brutas:4",
      "2:pedras-polidas:2",
      "3:big:3",
      "4:formas:0",
      "5:homedecor:0",
      "6:acessorios:0",
    ]);
    expect(await prisma.subcategory.findUnique({ where: { slug: "formas" } })).toBeNull();
  }, 30000);

  it("rodar duas vezes não duplica nada", async () => {
    await runSeed(prisma);
    const first = await counts();
    await runSeed(prisma);
    expect(await counts()).toEqual(first);
    expect(await prisma.category.count({ where: { slug: "formas" } })).toBe(1);
    expect(await prisma.subcategory.findUnique({ where: { slug: "formas" } })).toBeNull();
  }, 30000);

  it("mantém os produtos de exemplo nas mesmas categorias/subcategorias de antes", async () => {
    await runSeed(prisma);
    const product = await prisma.product.findUnique({ where: { slug: "ametista-uruguaia-5ct" }, include: { category: true, subcategory: true } });
    expect(product).toMatchObject({ category: { slug: "pedras-brutas" }, subcategory: { slug: "capelas-de-ametista" } });
  }, 30000);

  it("em dados JÁ migrados pelo script, NÃO recria a subcategoria 'formas' em BIG e não mexe nos produtos", async () => {
    const data = await seedOldLayout();
    const deps: Deps = {
      prisma,
      database: "localhost:5432/test",
      isLocalhost: true,
      r2Configured: false,
      putR2: async () => undefined,
      getR2: async () => Buffer.alloc(0),
      writeLocalFile: (n) => `/tmp/${n}`,
      readLocalFile: () => "",
      now: () => new Date(),
      log: () => undefined,
    };
    await runPromote({ apply: true }, deps);
    const formasCat = (await prisma.category.findUnique({ where: { slug: "formas" } }))!;

    await runSeed(prisma);
    await runSeed(prisma);

    expect(await prisma.subcategory.findUnique({ where: { slug: "formas" } })).toBeNull();
    expect(await prisma.category.count({ where: { slug: "formas" } })).toBe(1);
    expect(await prisma.category.count()).toBe(6);
    for (const p of data.moved) expect(await prisma.product.findUnique({ where: { id: p.id } })).toMatchObject({ categoryId: formasCat.id, subcategoryId: null });
  }, 30000);

  it("em banco AINDA NÃO migrado, o seed não move nem remove nada (só avisa) — quem migra é o script", async () => {
    const data = await seedOldLayout();
    const warn = vi.mocked(console.warn);

    await runSeed(prisma);

    expect(await prisma.subcategory.findUnique({ where: { slug: "formas" } })).not.toBeNull();
    for (const p of data.moved) expect(await prisma.product.findUnique({ where: { id: p.id } })).toMatchObject({ subcategoryId: data.formasSub.id });
    expect(warn.mock.calls.flat().join(" ")).toMatch(/promote-formas/);
  }, 30000);
});
