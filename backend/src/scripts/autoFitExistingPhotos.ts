import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import sharp from "sharp";
import type { AutoFitResult } from "../lib/autoFit";

// Enquadramento automático (autoFit) em lote das fotos JÁ cadastradas.
//
// Uso (a partir de backend/; em produção troque `npm run autofit:photos --` por
// `node dist/scripts/autoFitExistingPhotos.js`):
//
//   SIMULAÇÃO (padrão — não grava NADA, só imprime a tabela):
//     npm run autofit:photos --
//     npm run autofit:photos -- --limit=20 --product=esmeralda-colombiana,ametista
//
//   Pré-visualização na sua máquina, só lendo a API pública (apenas GET) e usando
//   o rembg local — gera JPEGs "antes | depois" numa pasta FORA do repositório:
//     npm run autofit:photos -- --api=https://SEU-BACKEND --local-preview=$HOME/autofit-preview
//
//   APLICAR (grava no R2 e no banco; NUNCA apaga objetos do R2):
//     npm run autofit:photos -- --apply [--limit=N] [--product=slug1,slug2]
//
//   DESFAZER um lote (simulação por padrão; some --apply para restaurar de verdade):
//     npm run autofit:photos -- --revert=_backups/auto-fit-YYYYMMDD-HHMMSS.json [--apply]
//
// Seguro e retomável: fotos cuja key já contém /auto-fit/ são puladas. Cada foto
// recortada vira um NOVO objeto products/{productId}/auto-fit/{uuid}.{ext}; o
// estado anterior vai para previousUrl/previousKey (o "Desfazer" do admin volta
// ao antes) e um manifesto é gravado no R2 para o --revert.

export const AUTO_FIT_KEY_MARKER = "/auto-fit/";
export const MANIFEST_PREFIX = "_backups/auto-fit-";

export interface PhotoRow {
  id: string;
  productId: string;
  slug: string;
  position: number;
  url: string;
  key: string;
  colorEnhanced: boolean;
  colorEnhanceLevel: string | null;
  previousUrl: string | null;
  previousKey: string | null;
  previousColorEnhanced: boolean;
  previousColorEnhanceLevel: string | null;
}

export interface PhotoUpdate {
  url: string;
  key: string;
  previousUrl: string | null;
  previousKey: string | null;
  previousColorEnhanced: boolean;
  previousColorEnhanceLevel: string | null;
}

export interface ManifestEntry {
  imageId: string;
  oldUrl: string;
  oldKey: string;
  oldPreviousUrl: string | null;
  oldPreviousKey: string | null;
  oldPreviousColorEnhanced: boolean;
  oldPreviousColorEnhanceLevel: string | null;
  newUrl: string;
  newKey: string;
}

export interface Manifest {
  version: 1;
  createdAt: string;
  entries: ManifestEntry[];
}

export interface Options {
  apply: boolean;
  limit?: number;
  products?: string[];
  localPreview?: string;
  api?: string;
  revert?: string;
}

export interface BatchDeps {
  listPhotos(): Promise<PhotoRow[]>;
  getPhoto(id: string): Promise<PhotoRow | null>;
  download(photo: PhotoRow): Promise<Buffer>;
  autoFit(buffer: Buffer): Promise<AutoFitResult>;
  putObject(key: string, body: Buffer, contentType: string): Promise<string>;
  getObjectText(key: string): Promise<string>;
  updatePhoto(id: string, data: PhotoUpdate): Promise<void>;
  savePreview(fileName: string, body: Buffer): void;
  uuid(): string;
  now(): Date;
  log(line: string): void;
}

export interface BatchReport {
  mode: "simulation" | "apply";
  cropped: number;
  unchanged: number;
  skipped: Record<string, number>;
  errors: number;
  manifestKey?: string;
  rows: ReportRow[];
}

export interface ReportRow {
  slug: string;
  position: number;
  imageId: string;
  before: string;
  after: string;
  action: string;
  reason: string;
}

// ---------------------------------------------------------------- argumentos

export function parseArgs(argv: string[]): Options {
  const opts: Options = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") opts.apply = true;
    else if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(n) || n <= 0) throw new Error(`--limit inválido: ${arg}`);
      opts.limit = n;
    } else if (arg.startsWith("--product=")) {
      opts.products = arg
        .slice("--product=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (opts.products.length === 0) throw new Error("--product precisa de pelo menos um slug");
    } else if (arg.startsWith("--local-preview=")) opts.localPreview = arg.slice("--local-preview=".length);
    else if (arg.startsWith("--api=")) opts.api = arg.slice("--api=".length).replace(/\/$/, "");
    else if (arg.startsWith("--revert=")) opts.revert = arg.slice("--revert=".length);
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  if (opts.api && (opts.apply || opts.revert)) {
    throw new Error("--api é só leitura (apenas GET): não pode ser combinado com --apply nem --revert");
  }
  if (opts.revert && (opts.limit || opts.products)) {
    throw new Error("--revert restaura o manifesto inteiro: não aceita --limit nem --product");
  }
  return opts;
}

// ------------------------------------------------------------------ utilidades

function compareDeterministic(a: PhotoRow, b: PhotoRow): number {
  return a.slug.localeCompare(b.slug) || a.position - b.position || a.id.localeCompare(b.id);
}

function fmtMetrics(m: { w: number; h: number; coverage: number | null }): string {
  return `${m.w}x${m.h} ${m.coverage === null ? "?" : `${Math.round(m.coverage * 100)}%`}`;
}

function extFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

export function formatTable(rows: ReportRow[]): string[] {
  const header = ["produto", "foto", "antes (tam cobertura)", "depois (tam cobertura)", "ação", "razão"];
  const body = rows.map((r) => [r.slug, `#${r.position} ${r.imageId.slice(-6)}`, r.before, r.after, r.action, r.reason]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i])).join("  ");
  return [line(header), widths.map((w) => "-".repeat(w)).join("  "), ...body.map(line)];
}

// Imagem "antes | depois" (JPEG) para conferência visual rápida.
export async function makeSideBySide(before: Buffer, after: Buffer): Promise<Buffer> {
  const CELL = 600;
  const BG = { r: 226, g: 232, b: 240 };
  const cell = (input: Buffer) =>
    sharp(input)
      .rotate()
      .resize(CELL, CELL, { fit: "contain", background: BG, withoutEnlargement: false })
      .flatten({ background: BG })
      .toBuffer();
  const [b, a] = await Promise.all([cell(before), cell(after)]);
  return sharp({ create: { width: CELL * 2 + 8, height: CELL, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([
      { input: b, left: 0, top: 0 },
      { input: a, left: CELL + 8, top: 0 },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

// ------------------------------------------------------------------- lote

export async function runAutoFitBatch(options: Options, deps: BatchDeps): Promise<BatchReport> {
  const report: BatchReport = {
    mode: options.apply ? "apply" : "simulation",
    cropped: 0,
    unchanged: 0,
    skipped: {},
    errors: 0,
    rows: [],
  };

  let photos = (await deps.listPhotos()).slice().sort(compareDeterministic);
  if (options.products) {
    const wanted = new Set(options.products);
    const found = new Set(photos.map((p) => p.slug));
    for (const slug of wanted) if (!found.has(slug)) deps.log(`Aviso: produto "${slug}" não encontrado (ou sem fotos).`);
    photos = photos.filter((p) => wanted.has(p.slug));
  }

  const manifest: Manifest = { version: 1, createdAt: deps.now().toISOString(), entries: [] };
  const manifestKey = `${MANIFEST_PREFIX}${stamp(deps.now())}.json`;
  if (options.apply) report.manifestKey = manifestKey;

  let eligible = 0;
  for (const photo of photos) {
    // Já enquadrada por um lote anterior: idempotente/retomável. Não conta no --limit.
    if (photo.key.includes(AUTO_FIT_KEY_MARKER)) {
      bump(report.skipped, "already_auto_fit");
      report.rows.push({ slug: photo.slug, position: photo.position, imageId: photo.id, before: "-", after: "-", action: "skipped", reason: "already_auto_fit" });
      continue;
    }
    if (options.limit !== undefined && eligible >= options.limit) break;
    eligible++;

    try {
      const original = await deps.download(photo);
      const result = await deps.autoFit(original);

      const row: ReportRow = {
        slug: photo.slug,
        position: photo.position,
        imageId: photo.id,
        before: fmtMetrics(result.before),
        after: fmtMetrics(result.after),
        action: result.action,
        reason: result.reason ?? "",
      };

      if (options.localPreview) {
        const name = `${photo.slug}-${photo.position}-${photo.id.slice(-6)}-${result.action}.jpg`;
        deps.savePreview(name, await makeSideBySide(original, result.buffer));
      }

      if (result.action === "cropped" && options.apply) {
        // 1) sobe o NOVO objeto (nunca sobrescreve nem apaga o antigo)
        const newKey = `products/${photo.productId}/auto-fit/${deps.uuid()}.${extFor(result.contentType)}`;
        const newUrl = await deps.putObject(newKey, result.buffer, result.contentType);

        // 2) registra no manifesto (gravado no R2 ANTES de mexer no banco)
        manifest.entries.push({
          imageId: photo.id,
          oldUrl: photo.url,
          oldKey: photo.key,
          oldPreviousUrl: photo.previousUrl,
          oldPreviousKey: photo.previousKey,
          oldPreviousColorEnhanced: photo.previousColorEnhanced,
          oldPreviousColorEnhanceLevel: photo.previousColorEnhanceLevel,
          newUrl,
          newKey,
        });
        try {
          await deps.putObject(manifestKey, Buffer.from(JSON.stringify(manifest, null, 2)), "application/json");
        } catch (err) {
          manifest.entries.pop();
          throw err;
        }

        // 3) só então atualiza o banco, espelhando o /treatment/confirm
        await deps.updatePhoto(photo.id, {
          url: newUrl,
          key: newKey,
          previousUrl: photo.url,
          previousKey: photo.key,
          previousColorEnhanced: photo.colorEnhanced,
          previousColorEnhanceLevel: photo.colorEnhanceLevel,
        });
      }

      // Sucesso: só agora a foto entra nas contagens.
      report.rows.push(row);
      if (result.action === "cropped") report.cropped++;
      else if (result.action === "unchanged") report.unchanged++;
      else bump(report.skipped, result.reason ?? "unknown");
    } catch (err) {
      // Falha numa foto não interrompe as demais.
      report.errors++;
      const message = err instanceof Error ? err.message.slice(0, 80) : String(err).slice(0, 80);
      report.rows.push({ slug: photo.slug, position: photo.position, imageId: photo.id, before: "-", after: "-", action: "error", reason: message });
      deps.log(`ERRO em ${photo.slug} #${photo.position} (${photo.id}): ${message}`);
    }
  }

  return report;
}

export function printReport(report: BatchReport, log: (line: string) => void): void {
  for (const line of formatTable(report.rows)) log(line);
  log("");
  log(`Recortadas: ${report.cropped}`);
  log(`Inalteradas: ${report.unchanged}`);
  const skippedTotal = Object.values(report.skipped).reduce((a, b) => a + b, 0);
  log(`Puladas: ${skippedTotal}${skippedTotal ? " (" + Object.entries(report.skipped).map(([k, v]) => `${k}: ${v}`).join(", ") + ")" : ""}`);
  log(`Erros: ${report.errors}`);
  if (report.mode === "simulation") log("\nSIMULAÇÃO — nada foi gravado. Use --apply para gravar.");
  else log(`\nAPLICADO. Manifesto (para --revert): ${report.manifestKey ?? "(nenhuma foto alterada)"}`);
}

// ----------------------------------------------------------------- reversão

export interface RevertReport {
  mode: "simulation" | "apply";
  restored: number;
  skipped: Record<string, number>;
  errors: number;
}

export async function runRevert(options: Options, deps: BatchDeps): Promise<RevertReport> {
  const report: RevertReport = { mode: options.apply ? "apply" : "simulation", restored: 0, skipped: {}, errors: 0 };
  const raw = JSON.parse(await deps.getObjectText(options.revert!)) as Manifest | ManifestEntry[];
  const entries = Array.isArray(raw) ? raw : raw.entries;

  for (const entry of entries) {
    try {
      const photo = await deps.getPhoto(entry.imageId);
      if (!photo) {
        bump(report.skipped, "image_not_found");
        continue;
      }
      // Só restaura se a foto ainda é a gerada por este lote (não sobrescreve
      // um tratamento feito depois pelo admin).
      if (photo.key !== entry.newKey) {
        bump(report.skipped, "changed_since");
        deps.log(`Pulada ${entry.imageId}: a foto mudou depois do lote.`);
        continue;
      }
      if (options.apply) {
        await deps.updatePhoto(entry.imageId, {
          url: entry.oldUrl,
          key: entry.oldKey,
          previousUrl: entry.oldPreviousUrl,
          previousKey: entry.oldPreviousKey,
          previousColorEnhanced: entry.oldPreviousColorEnhanced,
          previousColorEnhanceLevel: entry.oldPreviousColorEnhanceLevel,
        });
      }
      report.restored++;
    } catch (err) {
      report.errors++;
      deps.log(`ERRO ao restaurar ${entry.imageId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return report;
}

// ------------------------------------------------------------------ execução

function describeDatabase(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    // Só host, porta e nome do banco — nunca usuário/senha
    return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "(DATABASE_URL ausente ou inválida)";
  }
}

function r2Configured(): boolean {
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL } = process.env;
  return Boolean(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_PUBLIC_URL);
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function buildRealDeps(options: Options): Promise<BatchDeps> {
  // Imports dinâmicos: no modo --api (só leitura, na máquina do desenvolvedor)
  // não exigimos banco nem R2; env.ts só precisa destes valores para validar.
  if (options.api) {
    process.env.DATABASE_URL ??= "postgresql://unused:unused@localhost:5432/unused";
    process.env.JWT_SECRET ??= "unused";
  }
  const { autoFitSubject } = await import("../lib/autoFit");

  const base = {
    autoFit: (buffer: Buffer) => autoFitSubject(buffer),
    uuid: () => randomUUID(),
    now: () => new Date(),
    log: (line: string) => console.log(line),
    savePreview: (fileName: string, body: Buffer) => {
      fs.mkdirSync(options.localPreview!, { recursive: true });
      fs.writeFileSync(path.join(options.localPreview!, fileName), body);
    },
  };

  if (options.api) {
    const readOnly = async () => {
      throw new Error("modo --api é somente leitura");
    };
    return {
      ...base,
      async listPhotos() {
        const rows: PhotoRow[] = [];
        for (let page = 1; ; page++) {
          const res = await fetch(`${options.api}/api/products?active=true&page=${page}&pageSize=100`);
          if (!res.ok) throw new Error(`GET /api/products -> ${res.status}`);
          const data = (await res.json()) as { items: Array<{ id: string; slug: string; images: Array<Record<string, unknown>> }>; total: number; pageSize: number };
          for (const product of data.items) {
            for (const img of product.images) {
              rows.push({
                id: String(img.id),
                productId: product.id,
                slug: product.slug,
                position: Number(img.position ?? 0),
                url: String(img.url),
                key: String(img.key ?? ""),
                colorEnhanced: Boolean(img.colorEnhanced),
                colorEnhanceLevel: (img.colorEnhanceLevel as string | null) ?? null,
                previousUrl: (img.previousUrl as string | null) ?? null,
                previousKey: (img.previousKey as string | null) ?? null,
                previousColorEnhanced: Boolean(img.previousColorEnhanced),
                previousColorEnhanceLevel: (img.previousColorEnhanceLevel as string | null) ?? null,
              });
            }
          }
          if (page * data.pageSize >= data.total) break;
        }
        return rows;
      },
      getPhoto: async () => null,
      download: (photo: PhotoRow) => fetchBuffer(photo.url),
      putObject: readOnly,
      getObjectText: readOnly,
      updatePhoto: readOnly,
    };
  }

  const { prisma } = await import("../lib/prisma");
  const r2 = await import("../lib/r2");
  const toRow = (i: {
    id: string;
    productId: string;
    position: number;
    url: string;
    key: string;
    colorEnhanced: boolean;
    colorEnhanceLevel: string | null;
    previousUrl: string | null;
    previousKey: string | null;
    previousColorEnhanced: boolean;
    previousColorEnhanceLevel: string | null;
    product: { slug: string };
  }): PhotoRow => ({ ...i, slug: i.product.slug });

  return {
    ...base,
    async listPhotos() {
      const images = await prisma.productImage.findMany({
        include: { product: { select: { slug: true } } },
        orderBy: [{ product: { slug: "asc" } }, { position: "asc" }, { id: "asc" }],
      });
      return images.map(toRow);
    },
    async getPhoto(id) {
      const i = await prisma.productImage.findUnique({ where: { id }, include: { product: { select: { slug: true } } } });
      return i ? toRow(i) : null;
    },
    download: (photo) => r2.getObject(photo.key),
    putObject: (key, body, contentType) => r2.putObject(key, body, contentType),
    getObjectText: async (key) => (await r2.getObject(key)).toString("utf8"),
    async updatePhoto(id, data) {
      await prisma.productImage.update({ where: { id }, data });
    },
  };
}

export async function main(argv: string[]): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  if (options.localPreview) {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const target = path.resolve(options.localPreview);
    if (target === repoRoot || target.startsWith(repoRoot + path.sep)) {
      console.error("Erro: --local-preview deve apontar para uma pasta FORA do repositório.");
      return 1;
    }
  }

  if (options.api) {
    console.log(`Fonte: API pública ${options.api} (apenas GET) — nenhum banco nem R2 é usado, nada é gravado.`);
  } else {
    if (!r2Configured()) {
      console.error("Erro: variáveis R2_* ausentes (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL). Abortando.");
      return 1;
    }
    console.log(`Banco: ${describeDatabase()}`);
    console.log(`R2 bucket: ${process.env.R2_BUCKET_NAME}`);
  }

  const deps = await buildRealDeps(options);

  if (options.revert) {
    console.log(`Modo: REVERTER manifesto ${options.revert} ${options.apply ? "(--apply: grava)" : "(SIMULAÇÃO — some --apply para restaurar)"}`);
    const report = await runRevert(options, deps);
    console.log(`Restauradas${report.mode === "simulation" ? " (seriam)" : ""}: ${report.restored}`);
    console.log(`Puladas: ${Object.values(report.skipped).reduce((a, b) => a + b, 0)} ${JSON.stringify(report.skipped)}`);
    console.log(`Erros: ${report.errors}`);
    return report.errors > 0 ? 1 : 0;
  }

  console.log(`Modo: ${options.apply ? "APLICAR (grava no R2 e no banco; nunca apaga objetos)" : "SIMULAÇÃO (não grava nada)"}`);
  if (options.limit) console.log(`Limite: ${options.limit} foto(s)`);
  if (options.products) console.log(`Produtos: ${options.products.join(", ")}`);
  console.log("");

  const report = await runAutoFitBatch(options, deps);
  printReport(report, (l) => console.log(l));
  return report.errors > 0 ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
