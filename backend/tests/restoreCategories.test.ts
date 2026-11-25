import { afterAll, beforeEach, describe, expect, it } from "vitest";
import "./setup";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase } from "./helpers";
import { buildRestorePlan, parseArgs, runRestore, RestoreCategoriesError, type Deps } from "../src/scripts/restoreCategories";
import { buildCategoryExportCsv } from "../src/lib/categoryExportCsv";

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

function makeDeps(): Deps & { lines: string[] } {
  const lines: string[] = [];
  return { prisma, log: (line: string) => lines.push(line), lines };
}

describe("parseArgs", () => {
  it("exige exatamente um arquivo; --apply é opcional", () => {
    expect(parseArgs(["arquivo.csv"])).toEqual({ apply: false, filePath: "arquivo.csv" });
    expect(parseArgs(["arquivo.csv", "--apply"])).toEqual({ apply: true, filePath: "arquivo.csv" });
  });

  it("sem arquivo nenhum, ou argumento desconhecido, ou dois arquivos: erro", () => {
    expect(() => parseArgs([])).toThrow(RestoreCategoriesError);
    expect(() => parseArgs(["--desconhecido"])).toThrow(RestoreCategoriesError);
    expect(() => parseArgs(["a.csv", "b.csv"])).toThrow(RestoreCategoriesError);
  });
});

describe("buildRestorePlan — contra Postgres real", () => {
  it("resolve categoria/subcategoria pelo NOME contra o banco atual; peça já correta conta como noop", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const sub = await prisma.subcategory.create({ data: { name: "Ametistas", slug: "ametistas", position: 0, categoryId: category.id } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } }); // vai ganhar categoria+subcategoria
    const p2 = await prisma.product.create({ data: { name: "P2", slug: "p2", categoryId: category.id, subcategoryId: sub.id } }); // já correto

    const csv = buildCategoryExportCsv([
      { id: p1.id, sku: null, name: "P1", categoryName: "Big", subcategoryName: "Ametistas" },
      { id: p2.id, sku: null, name: "P2", categoryName: "Big", subcategoryName: "Ametistas" },
    ]);

    const plan = await buildRestorePlan(makeDeps(), csv);
    expect(plan.totalRows).toBe(2);
    expect(plan.noopCount).toBe(1);
    expect(plan.items).toEqual([{ id: p1.id, categoryId: category.id, subcategoryId: sub.id }]);
    expect(plan.errors).toHaveLength(0);
  });

  it("categoria/subcategoria vazias no CSV resolvem para null (Sem categoria)", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1", categoryId: category.id } });

    const csv = buildCategoryExportCsv([{ id: p1.id, sku: null, name: "P1", categoryName: null, subcategoryName: null }]);

    const plan = await buildRestorePlan(makeDeps(), csv);
    expect(plan.items).toEqual([{ id: p1.id, categoryId: null, subcategoryId: null }]);
  });

  it("nome de categoria inexistente gera erro na linha, não quebra o plano inteiro", async () => {
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } });
    const csv = buildCategoryExportCsv([{ id: p1.id, sku: null, name: "P1", categoryName: "Categoria Que Não Existe Mais", subcategoryName: null }]);

    const plan = await buildRestorePlan(makeDeps(), csv);
    expect(plan.items).toHaveLength(0);
    expect(plan.errors[0]).toMatchObject({ productId: p1.id, reason: expect.stringContaining("não existe mais") });
  });

  it("nome de categoria AMBÍGUO (duas categorias com o mesmo nome) gera erro, nunca escolhe uma", async () => {
    await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    await prisma.category.create({ data: { name: "Big", slug: "big-2", position: 1 } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } });
    const csv = buildCategoryExportCsv([{ id: p1.id, sku: null, name: "P1", categoryName: "Big", subcategoryName: null }]);

    const plan = await buildRestorePlan(makeDeps(), csv);
    expect(plan.items).toHaveLength(0);
    expect(plan.errors[0].reason).toContain("ambíguo");
  });

  it("cabeçalho diferente do esperado é rejeitado antes de processar qualquer linha", async () => {
    await expect(buildRestorePlan(makeDeps(), "id,nome\r\np1,X\r\n")).rejects.toThrow(RestoreCategoriesError);
  });
});

describe("runRestore — contra Postgres real", () => {
  it("SIMULAÇÃO (sem --apply) não grava nada no banco", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } });
    const csv = buildCategoryExportCsv([{ id: p1.id, sku: null, name: "P1", categoryName: "Big", subcategoryName: null }]);

    const deps = makeDeps();
    await runRestore({ apply: false, filePath: "x" }, deps, csv);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: p1.id } })).categoryId).toBeNull();
    expect(deps.lines.join("\n")).toContain("SIMULAÇÃO — nada foi gravado");
    expect(await prisma.adminActionLog.count()).toBe(0);
  });

  it("--apply aplica de verdade, numa transação, e grava log undo-compatível (mesma action do endpoint)", async () => {
    const category = await prisma.category.create({ data: { name: "Big", slug: "big", position: 0 } });
    const p1 = await prisma.product.create({ data: { name: "P1", slug: "p1" } });
    const csv = buildCategoryExportCsv([{ id: p1.id, sku: null, name: "P1", categoryName: "Big", subcategoryName: null }]);

    const deps = makeDeps();
    await runRestore({ apply: true, filePath: "x" }, deps, csv);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: p1.id } })).categoryId).toBe(category.id);
    const log = await prisma.adminActionLog.findFirst({ where: { action: "bulk_category_move" } });
    expect(log).not.toBeNull();
    expect((log?.payload as unknown as { source: string }).source).toBe("restore:categories");
  });
});
