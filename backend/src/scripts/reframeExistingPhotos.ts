import { randomUUID } from "crypto";
import { normalizeToPortrait, type PhotoFormatResult } from "../lib/photoFormat";
import {
  runRevert,
  type Manifest,
  type PhotoRow,
  type PhotoUpdate,
  type RevertReport,
} from "./autoFitExistingPhotos";

// Reenquadramento em 9:16 (em pé) das fotos JÁ cadastradas — mesmo padrão do
// autoFitExistingPhotos. Cada foto passa pelo MESMO tratamento dos uploads novos
// (lib/photoFormat.ts): orientação EXIF, 9:16 inteira sem recorte nem zoom,
// outra proporção encaixada inteira num canvas 9:16 com fundo desfocado da
// própria foto, lado maior ≤ 1920 px, sem EXIF/GPS.
//
// Uso (a partir de backend/; em produção troque `npm run reframe:photos --` por
// `node dist/scripts/reframeExistingPhotos.js`):
//
//   SIMULAÇÃO (padrão — não grava NADA, só imprime a tabela):
//     npm run reframe:photos --
//     npm run reframe:photos -- --limit=20 --product=esmeralda-colombiana,ametista
//
//   APLICAR (grava no R2 e no banco; NUNCA apaga objetos do R2):
//     npm run reframe:photos -- --apply [--limit=N] [--product=slug1,slug2]
//
//   DESFAZER um lote (simulação por padrão; some --apply para restaurar de verdade):
//     npm run reframe:photos -- --revert=_backups/reframe-9x16-YYYYMMDD-HHMMSS.json [--apply]
//
// PONTO DE PARTIDA: por padrão, a foto ATUAL do produto (a key em uso). Com
// --from-original, fotos que o lote do autoFit recortou (key com /auto-fit/)
// voltam a partir da foto de antes do recorte (previousKey), que mostra a peça
// com todo o entorno, como foi tirada; as demais seguem da foto atual.
//
// Seguro e retomável: fotos cuja key já contém /reframe-9x16/ são puladas. Cada
// foto reenquadrada vira um NOVO objeto products/{productId}/reframe-9x16/{uuid}.{ext};
// o estado anterior vai para previousUrl/previousKey (o "Desfazer" do admin volta
// ao antes) e um manifesto é gravado no R2 para o --revert. Fotos que já estão
// em 9:16, ≤ 1920 px e sem EXIF não são regravadas ("unchanged").

export const REFRAME_KEY_MARKER = "/reframe-9x16/";
export const REFRAME_MANIFEST_PREFIX = "_backups/reframe-9x16-";
const AUTO_FIT_MARKER = "/auto-fit/";

export interface ReframeOptions {
  apply: boolean;
  limit?: number;
  products?: string[];
  revert?: string;
  fromOriginal: boolean;
}

export interface ReframeDeps {
  listPhotos(): Promise<PhotoRow[]>;
  getPhoto(id: string): Promise<PhotoRow | null>;
  downloadKey(key: string): Promise<Buffer>;
  reframe(buffer: Buffer): Promise<PhotoFormatResult>;
  putObject(key: string, body: Buffer, contentType: string): Promise<string>;
  getObjectText(key: string): Promise<string>;
  updatePhoto(id: string, data: PhotoUpdate): Promise<void>;
  uuid(): string;
  now(): Date;
  log(line: string): void;
}

export interface ReframeRow {
  slug: string;
  position: number;
  imageId: string;
  source: string;
  before: string;
  after: string;
  action: string;
  reason: string;
}

export interface ReframeReport {
  mode: "simulation" | "apply";
  kept: number;
  fitted: number;
  unchanged: number;
  skipped: Record<string, number>;
  errors: number;
  manifestKey?: string;
  rows: ReframeRow[];
}

export function parseArgs(argv: string[]): ReframeOptions {
  const opts: ReframeOptions = { apply: false, fromOriginal: false };
  for (const arg of argv) {
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--from-original") opts.fromOriginal = true;
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
    } else if (arg.startsWith("--revert=")) opts.revert = arg.slice("--revert=".length);
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  if (opts.revert && (opts.limit || opts.products || opts.fromOriginal)) {
    throw new Error("--revert restaura o manifesto inteiro: não aceita --limit, --product nem --from-original");
  }
  return opts;
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

export function formatTable(rows: ReframeRow[]): string[] {
  const header = ["produto", "foto", "origem", "antes", "depois", "ação", "razão"];
  const body = rows.map((r) => [r.slug, `#${r.position} ${r.imageId.slice(-6)}`, r.source, r.before, r.after, r.action, r.reason]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i])).join("  ");
  return [line(header), widths.map((w) => "-".repeat(w)).join("  "), ...body.map(line)];
}

function compareDeterministic(a: PhotoRow, b: PhotoRow): number {
  return a.slug.localeCompare(b.slug) || a.position - b.position || a.id.localeCompare(b.id);
}

export async function runReframeBatch(options: ReframeOptions, deps: ReframeDeps): Promise<ReframeReport> {
  const report: ReframeReport = { mode: options.apply ? "apply" : "simulation", kept: 0, fitted: 0, unchanged: 0, skipped: {}, errors: 0, rows: [] };

  let photos = (await deps.listPhotos()).slice().sort(compareDeterministic);
  if (options.products) {
    const wanted = new Set(options.products);
    const found = new Set(photos.map((p) => p.slug));
    for (const slug of wanted) if (!found.has(slug)) deps.log(`Aviso: produto "${slug}" não encontrado (ou sem fotos).`);
    photos = photos.filter((p) => wanted.has(p.slug));
  }

  const manifest: Manifest = { version: 1, createdAt: deps.now().toISOString(), entries: [] };
  const manifestKey = `${REFRAME_MANIFEST_PREFIX}${stamp(deps.now())}.json`;
  if (options.apply) report.manifestKey = manifestKey;

  let eligible = 0;
  for (const photo of photos) {
    // Já reenquadrada por um lote anterior: idempotente/retomável. Não conta no --limit.
    if (photo.key.includes(REFRAME_KEY_MARKER)) {
      bump(report.skipped, "already_reframed");
      report.rows.push({ slug: photo.slug, position: photo.position, imageId: photo.id, source: "-", before: "-", after: "-", action: "skipped", reason: "already_reframed" });
      continue;
    }
    if (options.limit !== undefined && eligible >= options.limit) break;
    eligible++;

    const useOriginal = options.fromOriginal && photo.key.includes(AUTO_FIT_MARKER) && Boolean(photo.previousKey);
    const sourceKey = useOriginal ? photo.previousKey! : photo.key;

    try {
      const input = await deps.downloadKey(sourceKey);
      const result = await deps.reframe(input);
      const row: ReframeRow = {
        slug: photo.slug,
        position: photo.position,
        imageId: photo.id,
        source: useOriginal ? "original" : "atual",
        before: `${result.before.w}x${result.before.h}`,
        after: `${result.after.w}x${result.after.h}`,
        action: result.action,
        reason: result.action === "fitted" ? "encaixada no canvas 9:16" : result.action === "kept" ? "já 9:16" : "já 9:16 e limpa",
      };

      if (result.action !== "unchanged" && options.apply) {
        // 1) sobe o NOVO objeto (nunca sobrescreve nem apaga o antigo)
        const newKey = `products/${photo.productId}/reframe-9x16/${deps.uuid()}.${result.ext}`;
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

      report.rows.push(row);
      if (result.action === "kept") report.kept++;
      else if (result.action === "fitted") report.fitted++;
      else report.unchanged++;
    } catch (err) {
      // Falha numa foto não interrompe as demais.
      report.errors++;
      const message = err instanceof Error ? err.message.slice(0, 80) : String(err).slice(0, 80);
      report.rows.push({ slug: photo.slug, position: photo.position, imageId: photo.id, source: "-", before: "-", after: "-", action: "error", reason: message });
      deps.log(`ERRO em ${photo.slug} #${photo.position} (${photo.id}): ${message}`);
    }
  }
  return report;
}

export function printReport(report: ReframeReport, log: (line: string) => void): void {
  for (const line of formatTable(report.rows)) log(line);
  log("");
  log(`Encaixadas no canvas 9:16 (fundo desfocado): ${report.fitted}`);
  log(`Já em 9:16 (regravadas sem EXIF, ≤1920 px): ${report.kept}`);
  log(`Já corretas (não regravadas): ${report.unchanged}`);
  const skippedTotal = Object.values(report.skipped).reduce((a, b) => a + b, 0);
  log(`Puladas: ${skippedTotal}${skippedTotal ? " (" + Object.entries(report.skipped).map(([k, v]) => `${k}: ${v}`).join(", ") + ")" : ""}`);
  log(`Erros: ${report.errors}`);
  if (report.mode === "simulation") log("\nSIMULAÇÃO — nada foi gravado. Use --apply para gravar.");
  else log(`\nAPLICADO. Manifesto (para --revert): ${report.manifestKey ?? "(nenhuma foto alterada)"}`);
}

export function runReframeRevert(options: ReframeOptions, deps: ReframeDeps): Promise<RevertReport> {
  return runRevert(options, deps);
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

async function buildRealDeps(): Promise<ReframeDeps> {
  const { prisma } = await import("../lib/prisma");
  const r2 = await import("../lib/r2");
  const toRow = (i: PhotoRow & { product: { slug: string } }): PhotoRow => ({ ...i, slug: i.product.slug });
  return {
    reframe: (buffer) => normalizeToPortrait(buffer),
    uuid: () => randomUUID(),
    now: () => new Date(),
    log: (line) => console.log(line),
    async listPhotos() {
      const images = await prisma.productImage.findMany({
        include: { product: { select: { slug: true } } },
        orderBy: [{ product: { slug: "asc" } }, { position: "asc" }, { id: "asc" }],
      });
      return images.map((i) => toRow(i as unknown as PhotoRow & { product: { slug: string } }));
    },
    async getPhoto(id) {
      const i = await prisma.productImage.findUnique({ where: { id }, include: { product: { select: { slug: true } } } });
      return i ? toRow(i as unknown as PhotoRow & { product: { slug: string } }) : null;
    },
    downloadKey: (key) => r2.getObject(key),
    putObject: (key, body, contentType) => r2.putObject(key, body, contentType),
    getObjectText: async (key) => (await r2.getObject(key)).toString("utf8"),
    async updatePhoto(id, data) {
      await prisma.productImage.update({ where: { id }, data });
    },
  };
}

export async function main(argv: string[]): Promise<number> {
  let options: ReframeOptions;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  if (!r2Configured()) {
    console.error("Erro: variáveis R2_* ausentes (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL). Abortando.");
    return 1;
  }
  console.log(`Banco: ${describeDatabase()}`);
  console.log(`R2 bucket: ${process.env.R2_BUCKET_NAME}`);

  const deps = await buildRealDeps();

  if (options.revert) {
    console.log(`Modo: REVERTER manifesto ${options.revert} ${options.apply ? "(--apply: grava)" : "(SIMULAÇÃO — some --apply para restaurar)"}`);
    const report = await runReframeRevert(options, deps);
    console.log(`Restauradas${report.mode === "simulation" ? " (seriam)" : ""}: ${report.restored}`);
    console.log(`Puladas: ${Object.values(report.skipped).reduce((a, b) => a + b, 0)} ${JSON.stringify(report.skipped)}`);
    console.log(`Erros: ${report.errors}`);
    return report.errors > 0 ? 1 : 0;
  }

  console.log(`Modo: ${options.apply ? "APLICAR (grava no R2 e no banco; nunca apaga objetos)" : "SIMULAÇÃO (não grava nada)"}`);
  console.log(`Origem: ${options.fromOriginal ? "original anterior ao autoFit quando existir (--from-original)" : "foto atual do produto"}`);
  if (options.limit) console.log(`Limite: ${options.limit} foto(s)`);
  if (options.products) console.log(`Produtos: ${options.products.join(", ")}`);
  console.log("");

  const report = await runReframeBatch(options, deps);
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
