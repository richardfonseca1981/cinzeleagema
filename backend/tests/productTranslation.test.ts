import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./setup";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase } from "./helpers";

// Mocka só a chamada à Claude API — o resto (Prisma, lógica de salvar) roda
// de verdade, então o teste prova que translateAndSaveProduct realmente
// persiste o resultado, e que uma tradução indisponível nunca lança.
vi.mock("../src/lib/claude", () => ({
  translateProductText: vi.fn(),
}));

import { translateProductText } from "../src/lib/claude";
import { translateAndSaveProduct } from "../src/lib/productTranslation";

const mockedTranslate = vi.mocked(translateProductText);

let categoryId: string;

beforeEach(async () => {
  await cleanDatabase();
  const category = await prisma.category.create({ data: { name: "Homedecor", slug: "homedecor" } });
  categoryId = category.id;
});

afterEach(() => {
  mockedTranslate.mockReset();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("translateAndSaveProduct", () => {
  it("saves nameEn/descriptionEn when the translation succeeds", async () => {
    const product = await prisma.product.create({
      data: {
        name: "Ametista Bruta",
        slug: "ametista-bruta",
        description: "Peça única, tonalidade profunda.",
        price: 100,
        categoryId,
      },
    });

    mockedTranslate.mockResolvedValue({ nameEn: "Raw Amethyst", descriptionEn: "One-of-a-kind piece, deep hue." });

    const updated = await translateAndSaveProduct(product.id, product.name, product.description);

    expect(updated?.nameEn).toBe("Raw Amethyst");
    expect(updated?.descriptionEn).toBe("One-of-a-kind piece, deep hue.");

    const fromDb = await prisma.product.findUnique({ where: { id: product.id } });
    expect(fromDb?.nameEn).toBe("Raw Amethyst");
  });

  it("does not throw and leaves nameEn/descriptionEn untouched when the Claude API is unavailable", async () => {
    const product = await prisma.product.create({
      data: { name: "Citrino Lapidado", slug: "citrino-lapidado", price: 200, categoryId },
    });

    mockedTranslate.mockResolvedValue(null);

    const updated = await translateAndSaveProduct(product.id, product.name, product.description);
    expect(updated).toBeNull();

    const fromDb = await prisma.product.findUnique({ where: { id: product.id } });
    expect(fromDb?.nameEn).toBeNull();
    expect(fromDb?.active).toBe(true); // produto continua salvo normalmente
  });
});
