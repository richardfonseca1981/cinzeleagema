import fs from "fs";
import os from "os";
import path from "path";
import type { Prisma, PrismaClient, Subcategory } from "@prisma/client";

// Promove a subcategoria "Formas" (filha de BIG) a CATEGORIA de nível 1,
// levando junto os produtos que estão nela. Migração de DADOS (o schema não
// muda). Tudo é identificado por SLUG (os ids diferem entre ambientes).
//
// Uso (a partir de backend/; em produção troque `npm run promote-formas --` por
// `node dist/scripts/promoteFormasToCategory.js`):
//
//   SIMULAÇÃO (padrão — não grava nada, só mostra o plano):
//     npm run promote-formas
//
//   APLICAR (uma única transação; grava o manifesto ANTES):
//     npm run promote-formas -- --apply
//
//   DESFAZER (simulação até receber --apply):
//     npm run promote-formas -- --revert=_backups/promote-formas-AAAAMMDD-HHMMSS.json [--apply]
//     npm run promote-formas -- --revert=/caminho/local/promote-formas-....json [--apply]
//
// Idempotente: rodar de novo depois de migrado responde "nada a fazer". Em
// estado parcial, completa só o que falta. NÃO use o seed para migrar produção.

export const FORMAS_SLUG = "formas";
export const BIG_SLUG = "big";
export const FORMAS_CATEGORY_NAME = "Formas";

// Posições explícitas (nunca incrementos relativos): rodar de novo dá o mesmo resultado.
export const CATEGORY_POSITIONS: Readonly<Record<string, number>> = {
  "pedras-brutas": 1,
  "pedras-polidas": 2,
  big: 3,
  formas: 4,
  homedecor: 5,
  acessorios: 6,
};

export const BACKUP_DIR = "_backups/";
const TRANSACTION_TIMEOUT_MS = 60_000;

export class PromoteError extends Error {}

export interface ManifestProduct {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  subcategoryId: string | null;
}

export interface ManifestSubcategory {
  id: string;
  name: string;
  slug: string;
  position: number;
  categoryId: string;
}

export interface Manifest {
  version: 1;
  kind: "promote-formas";
  createdAt: string;
  database: string;
  // A categoria "formas" já existia antes do script (estado parcial)? O revert
  // não remove uma categoria que o script não criou.
  formasCategoryPreExisted: boolean;
  // Posição anterior de cada categoria (por slug) que existia antes.
  previousPositions: Record<string, number>;
  subcategory: ManifestSubcategory | null;
  products: ManifestProduct[];
}

export interface Options {
  apply: boolean;
  revert?: string;
}

export interface Deps {
  prisma: PrismaClient;
  database: string; // "host:porta/nome", sem credenciais
  isLocalhost: boolean;
  r2Configured: boolean;
  putR2(key: string, body: Buffer): Promise<void>;
  getR2(key: string): Promise<Buffer>;
  // Grava num arquivo local FORA do repositório e devolve o caminho completo.
  writeLocalFile(fileName: string, content: string): string;
  readLocalFile(filePath: string): string;
  now(): Date;
  log(line: string): void;
}

export interface PositionChange {
  slug: string;
  from: number | null;
  to: number;
}

export interface Plan {
  categoryExists: boolean;
  categoryId: string | null;
  oldSub: (Subcategory & { category: { slug: string } }) | null;
  positionChanges: PositionChange[];
  missingCategories: string[];
  extraCategories: string[];
  products: ManifestProduct[];
  previousPositions: Record<string, number>;
  nothingToDo: boolean;
}

export interface PromoteReport {
  mode: "simulation" | "apply";
  status: "nothing_to_do" | "simulated" | "applied";
  createdCategory: boolean;
  positionChanges: PositionChange[];
  moved: number;
  removedSubcategory: boolean;
  manifestRef?: string;
}

// ---------------------------------------------------------------- argumentos

export function parseArgs(argv: string[]): Options {
  const opts: Options = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") opts.apply = true;
    else if (arg.startsWith("--revert=")) {
      opts.revert = arg.slice("--revert=".length);
      if (!opts.revert) throw new PromoteError("--revert precisa da chave do manifesto (ou do caminho do arquivo)");
    } else throw new PromoteError(`Argumento desconhecido: ${arg}`);
  }
  return opts;
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

// -------------------------------------------------------------------- plano

export async function analyze(prisma: PrismaClient): Promise<Plan> {
  const oldSub = await prisma.subcategory.findUnique({ where: { slug: FORMAS_SLUG }, include: { category: { select: { slug: true } } } });
  if (oldSub && oldSub.category.slug !== BIG_SLUG) {
    throw new PromoteError(
      `A subcategoria "${FORMAS_SLUG}" existe, mas é filha de "${oldSub.category.slug}" e não de "${BIG_SLUG}". Abortando: confira os dados antes de migrar.`
    );
  }

  const categories = await prisma.category.findMany({ orderBy: { slug: "asc" } });
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const formas = bySlug.get(FORMAS_SLUG) ?? null;

  const previousPositions: Record<string, number> = {};
  const positionChanges: PositionChange[] = [];
  const missingCategories: string[] = [];
  for (const [slug, position] of Object.entries(CATEGORY_POSITIONS)) {
    const existing = bySlug.get(slug);
    if (!existing) {
      if (slug !== FORMAS_SLUG) missingCategories.push(slug);
      continue;
    }
    previousPositions[slug] = existing.position;
    if (existing.position !== position) positionChanges.push({ slug, from: existing.position, to: position });
  }
  const extraCategories = categories.map((c) => c.slug).filter((slug) => !(slug in CATEGORY_POSITIONS));

  const products = oldSub
    ? await prisma.product.findMany({
        where: { subcategoryId: oldSub.id },
        select: { id: true, name: true, slug: true, categoryId: true, subcategoryId: true },
        orderBy: [{ slug: "asc" }, { id: "asc" }],
      })
    : [];

  return {
    categoryExists: Boolean(formas),
    categoryId: formas?.id ?? null,
    oldSub,
    positionChanges,
    missingCategories,
    extraCategories,
    products,
    previousPositions,
    nothingToDo: Boolean(formas) && !oldSub && positionChanges.length === 0,
  };
}

export function printPlan(plan: Plan, log: (line: string) => void): void {
  log("Plano:");
  log(plan.categoryExists ? `  • Categoria "${FORMAS_SLUG}": já existe (não será recriada)` : `  • Categoria "${FORMAS_CATEGORY_NAME}" (slug "${FORMAS_SLUG}", posição ${CATEGORY_POSITIONS[FORMAS_SLUG]}, sem subcategorias): SERÁ CRIADA`);
  if (plan.positionChanges.length === 0) log("  • Posições das categorias: já estão corretas");
  else {
    log("  • Posições a mudar:");
    for (const c of plan.positionChanges) log(`      ${c.slug}: ${c.from} → ${c.to}`);
  }
  if (plan.oldSub) {
    log(`  • Produtos a mover da subcategoria "${FORMAS_SLUG}" (de "${BIG_SLUG}") para a categoria "${FORMAS_SLUG}" (subcategoryId → null): ${plan.products.length}`);
    for (const p of plan.products) log(`      - ${p.name} (${p.slug})`);
    log(`  • Subcategoria "${FORMAS_SLUG}" (id ${plan.oldSub.id}): SERÁ REMOVIDA (somente se não restar nenhum produto nela)`);
  } else {
    log(`  • Subcategoria "${FORMAS_SLUG}": não existe mais (nada a mover nem a remover)`);
  }
  if (plan.missingCategories.length) log(`  ! Categorias do desenho não encontradas (posição não fixada): ${plan.missingCategories.join(", ")}`);
  if (plan.extraCategories.length) log(`  ! Categorias fora do desenho (não serão alteradas): ${plan.extraCategories.join(", ")}`);
}

// ------------------------------------------------------------------ aplicar

function buildManifest(plan: Plan, deps: Deps): Manifest {
  return {
    version: 1,
    kind: "promote-formas",
    createdAt: deps.now().toISOString(),
    database: deps.database,
    formasCategoryPreExisted: plan.categoryExists,
    previousPositions: plan.previousPositions,
    subcategory: plan.oldSub
      ? { id: plan.oldSub.id, name: plan.oldSub.name, slug: plan.oldSub.slug, position: plan.oldSub.position, categoryId: plan.oldSub.categoryId }
      : null,
    products: plan.products,
  };
}

// Grava o manifesto ANTES de qualquer mudança no banco. Banco remoto → R2
// (obrigatório); localhost → arquivo local fora do repositório.
async function writeManifest(manifest: Manifest, deps: Deps): Promise<string> {
  const content = JSON.stringify(manifest, null, 2);
  const name = `promote-formas-${stamp(deps.now())}.json`;
  try {
    if (!deps.isLocalhost) {
      if (!deps.r2Configured) {
        throw new PromoteError("Banco remoto: o manifesto precisa ir para o R2, mas as variáveis R2_* estão ausentes. Abortando sem gravar nada.");
      }
      const key = `${BACKUP_DIR}${name}`;
      await deps.putR2(key, Buffer.from(content));
      return key;
    }
    return deps.writeLocalFile(name, content);
  } catch (err) {
    if (err instanceof PromoteError) throw err;
    throw new PromoteError(`Falha ao gravar o manifesto (${err instanceof Error ? err.message : String(err)}). Nada foi gravado no banco.`);
  }
}

export async function runPromote(options: Options, deps: Deps): Promise<PromoteReport> {
  deps.log(`Banco: ${deps.database}${deps.isLocalhost ? " (local)" : " (REMOTO — manifesto vai para o R2)"}`);
  deps.log(`Modo: ${options.apply ? "APLICAR (uma transação)" : "SIMULAÇÃO (não grava nada)"}`);
  deps.log("");

  const plan = await analyze(deps.prisma);
  const report: PromoteReport = {
    mode: options.apply ? "apply" : "simulation",
    status: "simulated",
    createdCategory: false,
    positionChanges: plan.positionChanges,
    moved: plan.products.length,
    removedSubcategory: false,
  };

  if (plan.nothingToDo) {
    report.status = "nothing_to_do";
    report.moved = 0;
    deps.log(`Nada a fazer: a categoria "${FORMAS_SLUG}" já existe, a subcategoria antiga não existe mais e as posições estão corretas.`);
    return report;
  }

  printPlan(plan, deps.log);
  deps.log("");

  if (!options.apply) {
    deps.log("SIMULAÇÃO — nada foi gravado. Use --apply para executar.");
    return report;
  }

  // 1) manifesto (se falhar, nada é gravado no banco)
  report.manifestRef = await writeManifest(buildManifest(plan, deps), deps);
  deps.log(`Manifesto gravado: ${report.manifestRef}`);

  // 2) uma única transação; qualquer erro desfaz tudo
  const manifestIds = new Set(plan.products.map((p) => p.id));
  const result = await deps.prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // (1) cria a categoria se não existir
      let category = await tx.category.findUnique({ where: { slug: FORMAS_SLUG } });
      let created = false;
      if (!category) {
        category = await tx.category.create({
          data: { name: FORMAS_CATEGORY_NAME, slug: FORMAS_SLUG, position: CATEGORY_POSITIONS[FORMAS_SLUG] },
        });
        created = true;
      }

      // (2) posições explícitas de TODAS as categorias do desenho
      for (const [slug, position] of Object.entries(CATEGORY_POSITIONS)) {
        await tx.category.updateMany({ where: { slug }, data: { position } });
      }

      // (3) move os produtos
      let moved = 0;
      let removed = false;
      const sub = await tx.subcategory.findUnique({ where: { slug: FORMAS_SLUG } });
      if (sub) {
        const current = await tx.product.findMany({ where: { subcategoryId: sub.id }, select: { id: true } });
        const unknown = current.filter((p) => !manifestIds.has(p.id));
        if (unknown.length > 0) {
          throw new PromoteError(
            `${unknown.length} produto(s) entraram na subcategoria "${FORMAS_SLUG}" depois do plano e não estão no manifesto. Transação desfeita; rode de novo.`
          );
        }
        moved = (await tx.product.updateMany({ where: { subcategoryId: sub.id }, data: { categoryId: category.id, subcategoryId: null } })).count;

        // (4) só remove a subcategoria se NENHUM produto ainda a referencia
        // (a FK é ON DELETE SET NULL: apagar com produtos os deixaria órfãos em silêncio)
        const remaining = await tx.product.count({ where: { subcategoryId: sub.id } });
        if (remaining > 0) {
          throw new PromoteError(`A subcategoria "${FORMAS_SLUG}" ainda é referenciada por ${remaining} produto(s). Transação desfeita; nada foi alterado.`);
        }
        await tx.subcategory.delete({ where: { id: sub.id } });
        removed = true;
      }
      return { created, moved, removed };
    },
    { isolationLevel: "Serializable", timeout: TRANSACTION_TIMEOUT_MS }
  );

  report.status = "applied";
  report.createdCategory = result.created;
  report.moved = result.moved;
  report.removedSubcategory = result.removed;
  deps.log("");
  deps.log("APLICADO.");
  deps.log(`  Categoria criada: ${result.created ? "sim" : "não (já existia)"}`);
  deps.log(`  Posições alteradas: ${plan.positionChanges.length}`);
  deps.log(`  Produtos movidos: ${result.moved}`);
  deps.log(`  Subcategoria removida: ${result.removed ? "sim" : "não (não existia)"}`);
  deps.log(`  Manifesto (para --revert): ${report.manifestRef}`);
  return report;
}

// ------------------------------------------------------------------ reverter

export interface RevertReport {
  mode: "simulation" | "apply";
  status: "nothing_to_do" | "simulated" | "applied";
  recreatedSubcategory: boolean;
  restoredProducts: number;
  skippedProducts: Array<{ id: string; reason: string }>;
  newProductsKept: Array<{ id: string; name: string; slug: string }>;
  removedCategory: boolean;
  restoredPositions: boolean;
}

async function loadManifest(ref: string, deps: Deps): Promise<Manifest> {
  let raw: string;
  try {
    raw = ref.startsWith("_backups/") ? (await deps.getR2(ref)).toString("utf8") : deps.readLocalFile(ref);
  } catch (err) {
    throw new PromoteError(`Não foi possível ler o manifesto "${ref}": ${err instanceof Error ? err.message : String(err)}`);
  }
  let manifest: Manifest;
  try {
    manifest = JSON.parse(raw) as Manifest;
  } catch {
    throw new PromoteError(`O manifesto "${ref}" não é um JSON válido.`);
  }
  if (manifest.kind !== "promote-formas" || manifest.version !== 1 || !Array.isArray(manifest.products)) {
    throw new PromoteError(`O arquivo "${ref}" não é um manifesto de promote-formas (versão 1).`);
  }
  return manifest;
}

export async function runRevert(options: Options, deps: Deps): Promise<RevertReport> {
  const manifest = await loadManifest(options.revert!, deps);
  const prisma = deps.prisma;

  deps.log(`Banco: ${deps.database}`);
  deps.log(`Modo: REVERTER manifesto ${options.revert} ${options.apply ? "(--apply: grava)" : "(SIMULAÇÃO — some --apply para restaurar)"}`);
  deps.log(`Manifesto criado em ${manifest.createdAt} (banco ${manifest.database})`);
  deps.log("");

  const formas = await prisma.category.findUnique({ where: { slug: FORMAS_SLUG } });
  const manifestSub = manifest.subcategory;
  const currentSub = manifestSub ? await prisma.subcategory.findUnique({ where: { slug: manifestSub.slug } }) : null;
  if (manifestSub && currentSub && currentSub.id !== manifestSub.id) {
    throw new PromoteError(`Já existe uma subcategoria "${manifestSub.slug}" com OUTRO id (${currentSub.id}); o manifesto tem ${manifestSub.id}. Abortando.`);
  }
  if (manifestSub && !currentSub) {
    const parent = await prisma.category.findUnique({ where: { id: manifestSub.categoryId } });
    if (!parent) throw new PromoteError(`A categoria pai da subcategoria (id ${manifestSub.categoryId}) não existe mais. Abortando.`);
  }

  // Produtos do manifesto: o que será restaurado e o que não deve ser tocado.
  const toRestore: ManifestProduct[] = [];
  const skippedProducts: Array<{ id: string; reason: string }> = [];
  for (const mp of manifest.products) {
    const p = await prisma.product.findUnique({ where: { id: mp.id } });
    if (!p) skippedProducts.push({ id: mp.id, reason: "produto não existe mais" });
    else if (p.categoryId === mp.categoryId && p.subcategoryId === mp.subcategoryId) skippedProducts.push({ id: mp.id, reason: "já restaurado" });
    else if (formas && p.categoryId === formas.id) toRestore.push(mp);
    else skippedProducts.push({ id: mp.id, reason: "foi movido depois da migração (não será tocado)" });
  }

  // Produtos criados depois na nova categoria: nunca são tocados.
  const manifestIds = new Set(manifest.products.map((p) => p.id));
  const inFormas = formas ? await prisma.product.findMany({ where: { categoryId: formas.id }, select: { id: true, name: true, slug: true } }) : [];
  const newProductsKept = inFormas.filter((p) => !manifestIds.has(p.id));

  const willRecreateSub = Boolean(manifestSub && !currentSub);
  const formasWillBeEmpty = Boolean(formas) && newProductsKept.length === 0 && (await prisma.subcategory.count({ where: { categoryId: formas!.id } })) === 0;
  const willRemoveCategory = Boolean(formas) && formasWillBeEmpty && !manifest.formasCategoryPreExisted;
  const categoryStays = Boolean(formas) && !willRemoveCategory;
  // Restaurar as posições com a categoria "formas" ainda existindo deixaria duas
  // categorias com a mesma posição: nesse caso as posições atuais são mantidas.
  const willRestorePositions = !categoryStays && Object.keys(manifest.previousPositions).length > 0;

  const nothing = !willRecreateSub && toRestore.length === 0 && !willRemoveCategory && !(willRestorePositions && (await positionsDiffer(prisma, manifest)));
  const report: RevertReport = {
    mode: options.apply ? "apply" : "simulation",
    status: nothing ? "nothing_to_do" : "simulated",
    recreatedSubcategory: willRecreateSub,
    restoredProducts: toRestore.length,
    skippedProducts,
    newProductsKept,
    removedCategory: willRemoveCategory,
    restoredPositions: willRestorePositions,
  };

  if (nothing) {
    deps.log("Nada a reverter: o estado já corresponde ao anterior à migração.");
    return report;
  }

  deps.log("Plano de reversão:");
  deps.log(willRecreateSub ? `  • Recriar a subcategoria "${manifestSub!.slug}" com o MESMO id (${manifestSub!.id}) em ${manifestSub!.categoryId}` : "  • Subcategoria: já existe");
  deps.log(`  • Produtos a devolver ao categoryId/subcategoryId anteriores: ${toRestore.length}`);
  for (const p of toRestore) deps.log(`      - ${p.name} (${p.slug})`);
  for (const s of skippedProducts) deps.log(`  ! produto ${s.id} ignorado: ${s.reason}`);
  deps.log(willRemoveCategory ? `  • Categoria "${FORMAS_SLUG}": ficará vazia e SERÁ REMOVIDA` : formas ? `  • Categoria "${FORMAS_SLUG}": MANTIDA${newProductsKept.length ? " (tem produtos criados depois da migração)" : manifest.formasCategoryPreExisted ? " (já existia antes do script)" : ""}` : "  • Categoria: já não existe");
  if (newProductsKept.length) {
    deps.log(`  ! AVISO: ${newProductsKept.length} produto(s) criado(s) depois na categoria "${FORMAS_SLUG}" NÃO serão tocados:`);
    for (const p of newProductsKept) deps.log(`      - ${p.name} (${p.slug})`);
  }
  deps.log(willRestorePositions ? "  • Posições anteriores das categorias: SERÃO RESTAURADAS" : "  • Posições: mantidas (a categoria \"formas\" continua existindo)");
  deps.log("");

  if (!options.apply) {
    deps.log("SIMULAÇÃO — nada foi gravado. Some --apply para restaurar.");
    return report;
  }

  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      if (willRecreateSub && manifestSub) {
        await tx.subcategory.create({
          data: { id: manifestSub.id, name: manifestSub.name, slug: manifestSub.slug, position: manifestSub.position, categoryId: manifestSub.categoryId },
        });
      }
      for (const mp of toRestore) {
        await tx.product.update({ where: { id: mp.id }, data: { categoryId: mp.categoryId, subcategoryId: mp.subcategoryId } });
      }
      if (willRemoveCategory && formas) {
        const left = await tx.product.count({ where: { categoryId: formas.id } });
        const subs = await tx.subcategory.count({ where: { categoryId: formas.id } });
        if (left > 0 || subs > 0) throw new PromoteError(`A categoria "${FORMAS_SLUG}" não está vazia (${left} produtos, ${subs} subcategorias). Transação desfeita.`);
        await tx.category.delete({ where: { id: formas.id } });
      }
      if (willRestorePositions) {
        for (const [slug, position] of Object.entries(manifest.previousPositions)) {
          await tx.category.updateMany({ where: { slug }, data: { position } });
        }
      }
    },
    { isolationLevel: "Serializable", timeout: TRANSACTION_TIMEOUT_MS }
  );

  report.status = "applied";
  deps.log("REVERTIDO.");
  deps.log(`  Subcategoria recriada: ${willRecreateSub ? "sim (mesmo id)" : "não"}`);
  deps.log(`  Produtos restaurados: ${toRestore.length}`);
  deps.log(`  Categoria removida: ${willRemoveCategory ? "sim" : "não"}`);
  deps.log(`  Posições restauradas: ${willRestorePositions ? "sim" : "não"}`);
  return report;
}

async function positionsDiffer(prisma: PrismaClient, manifest: Manifest): Promise<boolean> {
  for (const [slug, position] of Object.entries(manifest.previousPositions)) {
    const c = await prisma.category.findUnique({ where: { slug } });
    if (c && c.position !== position) return true;
  }
  return false;
}

// ------------------------------------------------------------------ execução

export function describeDatabase(url: string | undefined): { label: string; host: string } {
  try {
    const u = new URL(url ?? "");
    // Só host, porta e nome do banco — nunca usuário/senha
    return { label: `${u.hostname}:${u.port || "5432"}${u.pathname}`, host: u.hostname };
  } catch {
    return { label: "(DATABASE_URL ausente ou inválida)", host: "" };
  }
}

export function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function r2ConfiguredFromEnv(): boolean {
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  return Boolean(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
}

export async function main(argv: string[]): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const db = describeDatabase(process.env.DATABASE_URL);
  const local = isLocalHost(db.host);
  const r2Ok = r2ConfiguredFromEnv();

  // Manifesto de banco remoto vai para o R2 e é obrigatório: aborta ANTES de abrir o banco.
  if (options.apply && !options.revert && !local && !r2Ok) {
    console.error("Erro: banco remoto e variáveis R2_* ausentes — o manifesto (obrigatório) não poderia ser gravado. Abortando sem tocar no banco.");
    return 1;
  }
  if (options.revert?.startsWith("_backups/") && !r2Ok) {
    console.error("Erro: para ler o manifesto do R2 as variáveis R2_* são necessárias. Abortando.");
    return 1;
  }

  const { prisma } = await import("../lib/prisma");
  const r2 = r2Ok ? await import("../lib/r2") : null;
  const backupDir = path.join(os.homedir(), "promote-formas-backups");

  const deps: Deps = {
    prisma,
    database: db.label,
    isLocalhost: local,
    r2Configured: r2Ok,
    putR2: async (key, body) => {
      await r2!.putObject(key, body, "application/json");
    },
    getR2: (key) => r2!.getObject(key),
    writeLocalFile: (fileName, content) => {
      fs.mkdirSync(backupDir, { recursive: true });
      const full = path.join(backupDir, fileName);
      fs.writeFileSync(full, content, { flag: "wx" });
      return full;
    },
    readLocalFile: (p) => fs.readFileSync(p, "utf8"),
    now: () => new Date(),
    log: (line) => console.log(line),
  };

  try {
    if (options.revert) await runRevert(options, deps);
    else await runPromote(options, deps);
    return 0;
  } catch (err) {
    console.error(`\nERRO: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
