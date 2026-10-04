import { afterAll, beforeEach, describe, expect, it } from "vitest";
import "./setup";
import { prisma } from "../src/lib/prisma";
import {
  CATEGORY_POSITIONS,
  PromoteError,
  describeDatabase,
  isLocalHost,
  parseArgs,
  runPromote,
  runRevert,
  type Deps,
  type Manifest,
} from "../src/scripts/promoteFormasToCategory";
import { cleanDatabase } from "./helpers";
import { seedOldLayout, snapshot } from "./formasFixture";

// Banco de teste REAL; R2 e arquivos locais são fakes em memória. Nunca usa
// credenciais ou dados de produção.

const NOW = new Date("2026-10-05T12:00:00Z");

interface Harness {
  deps: Deps;
  logs: string[];
  r2: Map<string, Buffer>;
  files: Map<string, string>;
}

function makeHarness(overrides: Partial<Deps> = {}): Harness {
  const logs: string[] = [];
  const r2 = new Map<string, Buffer>();
  const files = new Map<string, string>();
  const deps: Deps = {
    prisma,
    database: "localhost:5432/site_pedras_preciosas_test",
    isLocalhost: true,
    r2Configured: false,
    putR2: async (key, body) => void r2.set(key, body),
    getR2: async (key) => {
      if (!r2.has(key)) throw new Error("NoSuchKey");
      return r2.get(key)!;
    },
    writeLocalFile: (name, content) => {
      const full = `/home/dev/promote-formas-backups/${name}`;
      files.set(full, content);
      return full;
    },
    readLocalFile: (p) => {
      if (!files.has(p)) throw new Error("ENOENT");
      return files.get(p)!;
    },
    now: () => NOW,
    log: (l) => logs.push(l),
    ...overrides,
  };
  return { deps, logs, r2, files };
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("parseArgs e utilitários", () => {
  it("padrão é simulação; lê --apply e --revert", () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
    expect(parseArgs(["--revert=_backups/x.json", "--apply"])).toEqual({ apply: true, revert: "_backups/x.json" });
  });

  it("recusa argumentos desconhecidos ou --revert vazio", () => {
    expect(() => parseArgs(["--tudo"])).toThrow(PromoteError);
    expect(() => parseArgs(["--revert="])).toThrow(PromoteError);
  });

  it("describeDatabase nunca expõe usuário nem senha", () => {
    const { label, host } = describeDatabase("postgresql://admin:SuperSecreta@db.exemplo.com:6543/loja?schema=public");
    expect(label).toBe("db.exemplo.com:6543/loja");
    expect(label).not.toMatch(/admin|SuperSecreta|@/);
    expect(host).toBe("db.exemplo.com");
  });

  it("isLocalHost", () => {
    expect(["localhost", "127.0.0.1", "::1"].every(isLocalHost)).toBe(true);
    expect(isLocalHost("db.railway.internal")).toBe(false);
  });
});

describe("simulação (padrão)", () => {
  it("não grava nada: banco idêntico, nenhum manifesto, nada no R2", async () => {
    await seedOldLayout();
    const before = await snapshot();
    const h = makeHarness();

    const report = await runPromote({ apply: false }, h.deps);

    expect(report).toMatchObject({ mode: "simulation", status: "simulated", moved: 3 });
    expect(await snapshot()).toEqual(before);
    expect(h.files.size).toBe(0);
    expect(h.r2.size).toBe(0);
  });

  it("mostra o plano: categoria a criar, posições, cada produto (nome e slug) e a subcategoria a remover", async () => {
    await seedOldLayout();
    const h = makeHarness();
    await runPromote({ apply: false }, h.deps);
    const text = h.logs.join("\n");

    expect(text).toContain("Banco: localhost:5432/site_pedras_preciosas_test");
    expect(text).toMatch(/Categoria "Formas".*SERÁ CRIADA/);
    expect(text).toMatch(/homedecor: 4 → 5/);
    expect(text).toMatch(/acessorios: 5 → 6/);
    expect(text).toMatch(/Produtos a mover.*: 3/);
    expect(text).toContain("Esfera de Quartzo (esfera-de-quartzo)");
    expect(text).toContain("Pirâmide de Selenita (piramide-de-selenita)");
    expect(text).toContain("Ovo de Ágata (inativo) (ovo-de-agata)");
    expect(text).toMatch(/Subcategoria "formas".*SERÁ REMOVIDA/);
    expect(text).toMatch(/SIMULAÇÃO — nada foi gravado/);
  });

  it("em banco remoto a simulação não exige R2", async () => {
    await seedOldLayout();
    const h = makeHarness({ isLocalhost: false, r2Configured: false, database: "db.exemplo.com:5432/loja" });
    await expect(runPromote({ apply: false }, h.deps)).resolves.toMatchObject({ status: "simulated" });
    expect(h.logs.join("\n")).toMatch(/REMOTO/);
  });
});

describe("--apply", () => {
  it("cria a categoria, fixa as posições, move os produtos e remove a subcategoria", async () => {
    const data = await seedOldLayout();
    const h = makeHarness();

    const report = await runPromote({ apply: true }, h.deps);

    expect(report).toMatchObject({ mode: "apply", status: "applied", createdCategory: true, moved: 3, removedSubcategory: true });

    const formas = await prisma.category.findUnique({ where: { slug: "formas" }, include: { subcategories: true } });
    expect(formas).toMatchObject({ name: "Formas", slug: "formas", position: 4 });
    expect(formas!.subcategories).toEqual([]);

    const categories = await prisma.category.findMany({ orderBy: { position: "asc" } });
    expect(categories.map((c) => `${c.position}:${c.slug}`)).toEqual([
      "1:pedras-brutas",
      "2:pedras-polidas",
      "3:big",
      "4:formas",
      "5:homedecor",
      "6:acessorios",
    ]);

    for (const p of data.moved) {
      expect(await prisma.product.findUnique({ where: { id: p.id } })).toMatchObject({ categoryId: formas!.id, subcategoryId: null });
    }
    expect(await prisma.subcategory.findUnique({ where: { slug: "formas" } })).toBeNull();
  });

  it("não toca em produtos de outras subcategorias de BIG nem de outras categorias, nem nas outras subcategorias", async () => {
    const data = await seedOldLayout();
    const othersBefore = await prisma.product.findMany({ where: { id: { in: data.others.map((p) => p.id) } }, orderBy: { slug: "asc" } });
    const subsBefore = (await prisma.subcategory.findMany({ where: { slug: { not: "formas" } }, orderBy: { slug: "asc" } }));

    await runPromote({ apply: true }, makeHarness().deps);

    const othersAfter = await prisma.product.findMany({ where: { id: { in: data.others.map((p) => p.id) } }, orderBy: { slug: "asc" } });
    expect(othersAfter).toEqual(othersBefore);
    expect(await prisma.subcategory.findMany({ where: { slug: { not: "formas" } }, orderBy: { slug: "asc" } })).toEqual(subsBefore);
    expect(await prisma.subcategory.count()).toBe(9);
    expect((await prisma.category.findUnique({ where: { slug: "big" }, include: { subcategories: { orderBy: { position: "asc" } } } }))!.subcategories.map((s) => s.slug)).toEqual([
      "ametistas",
      "calcitas",
      "citrinos",
    ]);
  });

  it("grava o manifesto ANTES, com produtos (ids e valores anteriores) e o registro completo da subcategoria", async () => {
    const data = await seedOldLayout();
    const h = makeHarness();

    const report = await runPromote({ apply: true }, h.deps);

    expect(report.manifestRef).toBe("/home/dev/promote-formas-backups/promote-formas-20261005-120000.json");
    const manifest = JSON.parse(h.files.get(report.manifestRef!)!) as Manifest;
    expect(manifest).toMatchObject({ version: 1, kind: "promote-formas", createdAt: NOW.toISOString(), formasCategoryPreExisted: false });
    expect(manifest.subcategory).toEqual({
      id: data.formasSub.id,
      name: "Formas",
      slug: "formas",
      position: 4,
      categoryId: data.big.id,
    });
    expect(manifest.products.map((p) => p.id).sort()).toEqual(data.moved.map((p) => p.id).sort());
    for (const p of manifest.products) expect(p).toMatchObject({ categoryId: data.big.id, subcategoryId: data.formasSub.id });
    expect(manifest.previousPositions).toEqual({ "pedras-brutas": 1, "pedras-polidas": 2, big: 3, homedecor: 4, acessorios: 5 });
    expect(manifest.database).toBe("localhost:5432/site_pedras_preciosas_test");
  });

  it("fixa posições explícitas: mesmo com posições bagunçadas o resultado é sempre o desenho", async () => {
    await seedOldLayout();
    await prisma.category.update({ where: { slug: "homedecor" }, data: { position: 99 } });
    await prisma.category.update({ where: { slug: "pedras-brutas" }, data: { position: 0 } });

    await runPromote({ apply: true }, makeHarness().deps);

    for (const [slug, position] of Object.entries(CATEGORY_POSITIONS)) {
      expect((await prisma.category.findUnique({ where: { slug } }))!.position).toBe(position);
    }
  });
});

describe("idempotência e estado parcial", () => {
  it("segunda execução: 'nada a fazer', sem erro e sem novo manifesto", async () => {
    await seedOldLayout();
    await runPromote({ apply: true }, makeHarness().deps);
    const after = await snapshot();

    const h = makeHarness();
    const report = await runPromote({ apply: true }, h.deps);

    expect(report).toMatchObject({ status: "nothing_to_do", moved: 0 });
    expect(h.logs.join("\n")).toMatch(/Nada a fazer/);
    expect(h.files.size).toBe(0);
    expect(await snapshot()).toEqual(after);
  });

  it("estado parcial A: categoria já existe mas a subcategoria ainda tem produtos → completa sem duplicar", async () => {
    const data = await seedOldLayout();
    await prisma.category.create({ data: { name: "Formas", slug: "formas", position: 4 } });

    const report = await runPromote({ apply: true }, makeHarness().deps);

    expect(report).toMatchObject({ status: "applied", createdCategory: false, moved: 3, removedSubcategory: true });
    expect(await prisma.category.count({ where: { slug: "formas" } })).toBe(1);
    expect(await prisma.subcategory.findUnique({ where: { slug: "formas" } })).toBeNull();
    const formas = (await prisma.category.findUnique({ where: { slug: "formas" } }))!;
    expect(await prisma.product.count({ where: { categoryId: formas.id, subcategoryId: null, id: { in: data.moved.map((p) => p.id) } } })).toBe(3);
  });

  it("estado parcial B: produtos já movidos à mão, subcategoria vazia → só remove a subcategoria", async () => {
    const data = await seedOldLayout();
    const formasCat = await prisma.category.create({ data: { name: "Formas", slug: "formas", position: 4 } });
    await prisma.product.updateMany({ where: { id: { in: data.moved.map((p) => p.id) } }, data: { categoryId: formasCat.id, subcategoryId: null } });

    const report = await runPromote({ apply: true }, makeHarness().deps);

    expect(report).toMatchObject({ status: "applied", moved: 0, removedSubcategory: true });
    expect(await prisma.subcategory.findUnique({ where: { slug: "formas" } })).toBeNull();
    expect((await prisma.category.findUnique({ where: { slug: "homedecor" } }))!.position).toBe(5);
  });

  it("estado parcial C: tudo migrado mas posições erradas → só corrige as posições", async () => {
    await seedOldLayout();
    await runPromote({ apply: true }, makeHarness().deps);
    await prisma.category.update({ where: { slug: "acessorios" }, data: { position: 5 } });

    const report = await runPromote({ apply: true }, makeHarness().deps);

    expect(report).toMatchObject({ status: "applied", moved: 0, removedSubcategory: false });
    expect(report.positionChanges).toEqual([{ slug: "acessorios", from: 5, to: 6 }]);
    expect((await prisma.category.findUnique({ where: { slug: "acessorios" } }))!.position).toBe(6);
  });

  it("banco sem 'formas' nenhum: cria a categoria vazia e fixa as posições", async () => {
    await prisma.category.create({ data: { name: "Big", slug: "big", position: 3 } });
    const report = await runPromote({ apply: true }, makeHarness().deps);
    expect(report).toMatchObject({ status: "applied", createdCategory: true, moved: 0, removedSubcategory: false });
  });
});

describe("abortos: nada fica pela metade", () => {
  it("subcategoria ainda referenciada por algum produto: aborta a transação inteira e não deixa mudança", async () => {
    await seedOldLayout();
    const before = await snapshot();

    // O move é anulado dentro da transação: sobram produtos referenciando a subcategoria.
    const proxied = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop === "$transaction") {
          return (fn: (tx: unknown) => Promise<unknown>, options: unknown) =>
            target.$transaction(
              (tx) =>
                fn(
                  new Proxy(tx, {
                    get(t, p) {
                      const value = Reflect.get(t, p);
                      if (p === "product") {
                        return new Proxy(value, {
                          get(pt, pp) {
                            if (pp === "updateMany") return async () => ({ count: 0 });
                            const v = Reflect.get(pt, pp);
                            return typeof v === "function" ? v.bind(pt) : v;
                          },
                        });
                      }
                      return typeof value === "function" ? value.bind(t) : value;
                    },
                  })
                ),
              options as never
            );
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const h = makeHarness({ prisma: proxied as typeof prisma });

    await expect(runPromote({ apply: true }, h.deps)).rejects.toThrow(/ainda é referenciada por 3 produto/);

    expect(await snapshot()).toEqual(before); // categoria NÃO criada, posições intactas, subcategoria e produtos intactos
  });

  it("produto entra na subcategoria depois do plano (fora do manifesto): aborta e desfaz tudo", async () => {
    const data = await seedOldLayout();
    const before = await snapshot();

    // Determinístico: logo depois do plano e do manifesto, e imediatamente antes
    // da transação, outro processo cadastra um produto na subcategoria.
    const proxied = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop === "$transaction") {
          return async (fn: never, options: never) => {
            await target.product.create({
              data: { name: "Intruso", slug: "intruso", price: 1, categoryId: data.big.id, subcategoryId: data.formasSub.id },
            });
            return target.$transaction(fn, options);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const h = makeHarness({ prisma: proxied as typeof prisma });

    await expect(runPromote({ apply: true }, h.deps)).rejects.toThrow(/depois do plano e não estão no manifesto/);

    const after = await snapshot();
    expect(after.categories).toEqual(before.categories); // categoria NÃO criada, posições iguais
    expect(after.subcategories).toEqual(before.subcategories); // subcategoria continua lá
    // nenhum produto foi movido (só o intruso foi acrescentado, ainda na subcategoria)
    expect(after.products.filter((p: { slug: string }) => p.slug !== "intruso")).toEqual(before.products);
    expect(after.products.find((p: { slug: string }) => p.slug === "intruso").subcategoryId).toBe(data.formasSub.id);
  });

  it("falha ao gravar o manifesto: não grava NADA no banco", async () => {
    await seedOldLayout();
    const before = await snapshot();
    const h = makeHarness({
      writeLocalFile: () => {
        throw new Error("disco cheio");
      },
    });

    await expect(runPromote({ apply: true }, h.deps)).rejects.toThrow(/Falha ao gravar o manifesto.*Nada foi gravado no banco/);
    expect(await snapshot()).toEqual(before);
  });

  it("banco remoto sem R2_*: o manifesto é obrigatório — aborta sem gravar", async () => {
    await seedOldLayout();
    const before = await snapshot();
    const h = makeHarness({ isLocalhost: false, r2Configured: false, database: "db.exemplo.com:5432/loja" });

    await expect(runPromote({ apply: true }, h.deps)).rejects.toThrow(/R2_\* estão ausentes/);
    expect(await snapshot()).toEqual(before);
    expect(h.files.size).toBe(0);
  });

  it("banco remoto com R2: o manifesto vai para _backups/promote-formas-<data-hora>.json", async () => {
    await seedOldLayout();
    const h = makeHarness({ isLocalhost: false, r2Configured: true, database: "db.exemplo.com:5432/loja" });

    const report = await runPromote({ apply: true }, h.deps);

    expect(report.manifestRef).toBe("_backups/promote-formas-20261005-120000.json");
    expect(h.files.size).toBe(0);
    const manifest = JSON.parse(h.r2.get(report.manifestRef!)!.toString()) as Manifest;
    expect(manifest.products).toHaveLength(3);
    expect(await prisma.subcategory.findUnique({ where: { slug: "formas" } })).toBeNull();
  });

  it("subcategoria 'formas' que não é filha de BIG: aborta sem tocar em nada", async () => {
    const data = await seedOldLayout();
    await prisma.subcategory.update({ where: { slug: "formas" }, data: { categoryId: data.brutas.id } });
    const before = await snapshot();

    await expect(runPromote({ apply: true }, makeHarness().deps)).rejects.toThrow(/é filha de "pedras-brutas"/);
    expect(await snapshot()).toEqual(before);
  });
});

describe("--revert", () => {
  it("apply + revert --apply devolve o banco EXATAMENTE ao estado original (id da subcategoria, produtos e posições)", async () => {
    await seedOldLayout();
    const original = await snapshot();
    const h = makeHarness();
    const { manifestRef } = await runPromote({ apply: true }, h.deps);

    const report = await runRevert({ apply: true, revert: manifestRef! }, h.deps);

    expect(report).toMatchObject({ status: "applied", recreatedSubcategory: true, restoredProducts: 3, removedCategory: true, restoredPositions: true });
    expect(await snapshot()).toEqual(original);
  });

  it("revert sem --apply é simulação: não altera nada", async () => {
    await seedOldLayout();
    const h = makeHarness();
    const { manifestRef } = await runPromote({ apply: true }, h.deps);
    const migrated = await snapshot();

    const report = await runRevert({ apply: false, revert: manifestRef! }, h.deps);

    expect(report).toMatchObject({ mode: "simulation", status: "simulated", restoredProducts: 3 });
    expect(await snapshot()).toEqual(migrated);
    expect(h.logs.join("\n")).toMatch(/SIMULAÇÃO — nada foi gravado/);
  });

  it("produtos criados depois na nova categoria NÃO são tocados: aviso, categoria e posições mantidas", async () => {
    const data = await seedOldLayout();
    const h = makeHarness();
    const { manifestRef } = await runPromote({ apply: true }, h.deps);
    const formas = (await prisma.category.findUnique({ where: { slug: "formas" } }))!;
    const novo = await prisma.product.create({ data: { name: "Cubo Novo", slug: "cubo-novo", price: 5, categoryId: formas.id } });

    const report = await runRevert({ apply: true, revert: manifestRef! }, h.deps);

    expect(report.newProductsKept.map((p) => p.slug)).toEqual(["cubo-novo"]);
    expect(report).toMatchObject({ removedCategory: false, restoredPositions: false, restoredProducts: 3 });
    expect(h.logs.join("\n")).toMatch(/AVISO: 1 produto.*NÃO serão tocados[\s\S]*Cubo Novo \(cubo-novo\)/);
    expect(await prisma.product.findUnique({ where: { id: novo.id } })).toMatchObject({ categoryId: formas.id, subcategoryId: null });
    expect(await prisma.category.findUnique({ where: { slug: "formas" } })).not.toBeNull();
    // os 3 produtos antigos voltaram à subcategoria recriada
    expect(await prisma.product.count({ where: { subcategoryId: data.formasSub.id } })).toBe(3);
  });

  it("segundo revert: nada a reverter", async () => {
    await seedOldLayout();
    const h = makeHarness();
    const { manifestRef } = await runPromote({ apply: true }, h.deps);
    await runRevert({ apply: true, revert: manifestRef! }, h.deps);
    const state = await snapshot();

    const report = await runRevert({ apply: true, revert: manifestRef! }, h.deps);

    expect(report.status).toBe("nothing_to_do");
    expect(await snapshot()).toEqual(state);
  });

  it("produto que o admin moveu depois da migração não é revertido", async () => {
    const data = await seedOldLayout();
    const h = makeHarness();
    const { manifestRef } = await runPromote({ apply: true }, h.deps);
    await prisma.product.update({ where: { id: data.moved[0].id }, data: { categoryId: data.homedecor.id } });

    const report = await runRevert({ apply: true, revert: manifestRef! }, h.deps);

    expect(report.restoredProducts).toBe(2);
    expect(report.skippedProducts).toEqual([{ id: data.moved[0].id, reason: "foi movido depois da migração (não será tocado)" }]);
    expect((await prisma.product.findUnique({ where: { id: data.moved[0].id } }))!.categoryId).toBe(data.homedecor.id);
  });

  it("lê o manifesto do R2 quando a referência começa com _backups/", async () => {
    await seedOldLayout();
    const original = await snapshot();
    const h = makeHarness({ isLocalhost: false, r2Configured: true, database: "db.exemplo.com:5432/loja" });
    const { manifestRef } = await runPromote({ apply: true }, h.deps);
    expect(manifestRef).toMatch(/^_backups\//);

    await runRevert({ apply: true, revert: manifestRef! }, h.deps);
    expect(await snapshot()).toEqual(original);
  });

  it("manifesto inexistente ou inválido: erro claro", async () => {
    const h = makeHarness();
    await expect(runRevert({ apply: true, revert: "/nao/existe.json" }, h.deps)).rejects.toThrow(/Não foi possível ler o manifesto/);
    h.files.set("/ruim.json", "{ não é json");
    await expect(runRevert({ apply: true, revert: "/ruim.json" }, h.deps)).rejects.toThrow(/não é um JSON válido/);
    h.files.set("/outro.json", JSON.stringify({ kind: "outra-coisa", version: 1, products: [] }));
    await expect(runRevert({ apply: true, revert: "/outro.json" }, h.deps)).rejects.toThrow(/não é um manifesto/);
  });
});
