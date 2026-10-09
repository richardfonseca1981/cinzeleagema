import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizeToPortrait } from "../src/lib/photoFormat";
import type { Manifest, PhotoRow } from "../src/scripts/autoFitExistingPhotos";
import {
  REFRAME_KEY_MARKER,
  parseArgs,
  printReport,
  runReframeBatch,
  runReframeRevert,
  type ReframeDeps,
  type ReframeOptions,
} from "../src/scripts/reframeExistingPhotos";

// Banco e R2 em memória; o enquadramento é o real.

async function img(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 90, g: 120, b: 150 } } }).jpeg().toBuffer();
}

function row(overrides: Partial<PhotoRow> & Pick<PhotoRow, "id" | "slug">): PhotoRow {
  return {
    productId: `prod-${overrides.slug}`,
    position: 0,
    url: `https://cdn.test/products/prod-${overrides.slug}/${overrides.id}.jpg`,
    key: `products/prod-${overrides.slug}/${overrides.id}.jpg`,
    colorEnhanced: false,
    colorEnhanceLevel: null,
    previousUrl: null,
    previousKey: null,
    previousColorEnhanced: false,
    previousColorEnhanceLevel: null,
    ...overrides,
  };
}

const opts = (o: Partial<ReframeOptions> = {}): ReframeOptions => ({ apply: false, fromOriginal: false, ...o });

let rows: Map<string, PhotoRow>;
let storage: Map<string, { body: Buffer; contentType: string }>;
let puts: string[];
let updates: string[];
let deps: ReframeDeps;
let counter: number;

beforeEach(async () => {
  counter = 0;
  puts = [];
  updates = [];
  rows = new Map();
  storage = new Map();
  const add = async (r: PhotoRow, w: number, h: number) => {
    rows.set(r.id, r);
    storage.set(r.key, { body: await img(w, h), contentType: "image/jpeg" });
  };
  await add(row({ id: "a1", slug: "alfa" }), 1200, 900); // 4:3 -> encaixa
  await add(row({ id: "b1", slug: "beta" }), 720, 1280); // 9:16 limpa -> inalterada
  await add(row({ id: "c1", slug: "gama" }), 2160, 3840); // 9:16 grande -> reduz
  await add(row({ id: "d1", slug: "delta", key: "products/prod-delta/reframe-9x16/x.webp" }), 720, 1280); // já feita
  // foto recortada pelo autoFit: a anterior (original) está em previousKey
  const prev = "products/prod-eps/orig.jpg";
  storage.set(prev, { body: await img(3000, 2000), contentType: "image/jpeg" });
  await add(row({ id: "e1", slug: "eps", key: "products/prod-eps/auto-fit/z.jpg", previousKey: prev, previousUrl: `https://cdn.test/${prev}` }), 800, 800);

  deps = {
    listPhotos: async () => [...rows.values()],
    getPhoto: async (id) => rows.get(id) ?? null,
    downloadKey: async (key) => storage.get(key)!.body,
    reframe: (b) => normalizeToPortrait(b),
    putObject: async (key, body, contentType) => {
      puts.push(key);
      storage.set(key, { body, contentType });
      return `https://cdn.test/${key}`;
    },
    getObjectText: async (key) => storage.get(key)!.body.toString("utf8"),
    updatePhoto: async (id, data) => {
      updates.push(id);
      rows.set(id, { ...rows.get(id)!, ...data });
    },
    uuid: () => `uuid-${++counter}`,
    now: () => new Date("2026-10-09T12:00:00Z"),
    log: () => {},
  };
});

describe("parseArgs", () => {
  it("simulação por padrão", () => {
    expect(parseArgs([])).toEqual({ apply: false, fromOriginal: false });
  });
  it("aceita --apply, --limit, --product, --from-original", () => {
    expect(parseArgs(["--apply", "--limit=5", "--product=a,b", "--from-original"])).toEqual({
      apply: true,
      limit: 5,
      products: ["a", "b"],
      fromOriginal: true,
    });
  });
  it("--revert não combina com --limit", () => {
    expect(() => parseArgs(["--revert=_backups/x.json", "--limit=3"])).toThrow();
    expect(() => parseArgs(["--limit=0"])).toThrow();
    expect(() => parseArgs(["--api=x"])).toThrow(/desconhecido/);
  });
});

describe("runReframeBatch", () => {
  it("SIMULAÇÃO (padrão) não grava nada, mas classifica cada foto", async () => {
    const report = await runReframeBatch(opts(), deps);
    expect(puts).toEqual([]);
    expect(updates).toEqual([]);
    expect(report.mode).toBe("simulation");
    expect(report.fitted).toBe(2); // alfa (4:3) e eps (1:1)
    expect(report.kept).toBe(1); // gama reduzida
    expect(report.unchanged).toBe(1); // beta
    expect(report.skipped).toEqual({ already_reframed: 1 });
    expect(report.errors).toBe(0);
    const lines: string[] = [];
    printReport(report, (l) => lines.push(l));
    expect(lines.join("\n")).toMatch(/SIMULAÇÃO/);
  });

  it("--apply grava objetos novos, manifesto no R2 e atualiza o banco (guardando a anterior)", async () => {
    const report = await runReframeBatch(opts({ apply: true }), deps);
    expect(report.manifestKey).toBe("_backups/reframe-9x16-20261009-120000.json");
    expect(updates.sort()).toEqual(["a1", "c1", "e1"]);
    const a1 = rows.get("a1")!;
    expect(a1.key).toBe("products/prod-alfa/reframe-9x16/uuid-1.webp");
    expect(a1.key).toContain(REFRAME_KEY_MARKER);
    expect(a1.previousKey).toBe("products/prod-alfa/a1.jpg");
    // nenhum objeto antigo foi apagado/sobrescrito
    expect(storage.get("products/prod-alfa/a1.jpg")).toBeDefined();
    const meta = await sharp(storage.get(a1.key)!.body).metadata();
    expect(meta.width! / meta.height!).toBeCloseTo(9 / 16, 2);
    const manifest = JSON.parse(storage.get(report.manifestKey!)!.body.toString()) as Manifest;
    expect(manifest.entries.map((e) => e.imageId).sort()).toEqual(["a1", "c1", "e1"]);
  });

  it("é idempotente: rodar de novo não refaz as já reenquadradas", async () => {
    await runReframeBatch(opts({ apply: true }), deps);
    puts.length = 0;
    updates.length = 0;
    const second = await runReframeBatch(opts({ apply: true }), deps);
    expect(updates).toEqual([]);
    expect(second.skipped.already_reframed).toBe(4);
  });

  it("--limit e --product", async () => {
    const limited = await runReframeBatch(opts({ limit: 1 }), deps);
    expect(limited.rows.filter((r) => r.action !== "skipped")).toHaveLength(1);
    const one = await runReframeBatch(opts({ products: ["gama"] }), deps);
    expect(one.rows.map((r) => r.slug)).toEqual(["gama"]);
  });

  it("parte da foto ATUAL por padrão e do original anterior ao autoFit com --from-original", async () => {
    const current = await runReframeBatch(opts({ products: ["eps"] }), deps);
    expect(current.rows[0]).toMatchObject({ source: "atual", before: "800x800" });
    const original = await runReframeBatch(opts({ products: ["eps"], fromOriginal: true }), deps);
    expect(original.rows[0]).toMatchObject({ source: "original", before: "3000x2000" });
  });

  it("erro numa foto não interrompe as demais", async () => {
    storage.set("products/prod-alfa/a1.jpg", { body: Buffer.from("lixo"), contentType: "image/jpeg" });
    const report = await runReframeBatch(opts({ apply: true }), deps);
    expect(report.errors).toBe(1);
    expect(updates.sort()).toEqual(["c1", "e1"]);
  });
});

describe("--revert", () => {
  it("restaura o estado anterior pelo manifesto (simulação não grava)", async () => {
    const before = rows.get("a1")!;
    const report = await runReframeBatch(opts({ apply: true }), deps);

    const sim = await runReframeRevert({ apply: false, fromOriginal: false, revert: report.manifestKey }, deps);
    expect(sim.restored).toBe(3);
    expect(rows.get("a1")!.key).not.toBe(before.key);

    const done = await runReframeRevert({ apply: true, fromOriginal: false, revert: report.manifestKey }, deps);
    expect(done.restored).toBe(3);
    expect(rows.get("a1")).toMatchObject({ key: before.key, url: before.url, previousKey: null });
    expect(rows.get("e1")!.key).toBe("products/prod-eps/auto-fit/z.jpg");
  });
});
