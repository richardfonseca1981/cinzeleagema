import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { autoFitSubject } from "../src/lib/autoFit";
import {
  AUTO_FIT_KEY_MARKER,
  formatTable,
  makeSideBySide,
  parseArgs,
  printReport,
  runAutoFitBatch,
  runRevert,
  type BatchDeps,
  type Manifest,
  type Options,
  type PhotoRow,
} from "../src/scripts/autoFitExistingPhotos";

// Banco, R2 e rembg fora de cena: tudo em memória. O autoFit é o real, usando
// PNGs transparentes (a própria transparência localiza a peça — sem rembg).

const SUBJECT = { r: 120, g: 60, b: 200 };

async function transparentPng(width: number, height: number, rect: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      const i = (y * width + x) * 4;
      raw[i] = SUBJECT.r;
      raw[i + 1] = SUBJECT.g;
      raw[i + 2] = SUBJECT.b;
      raw[i + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

const OFF_CENTER = { left: 1300, top: 200, width: 500, height: 400 };

function row(overrides: Partial<PhotoRow> & Pick<PhotoRow, "id" | "slug">): PhotoRow {
  return {
    productId: `prod-${overrides.slug}`,
    position: 0,
    url: `https://cdn.test/products/prod-${overrides.slug}/${overrides.id}.png`,
    key: `products/prod-${overrides.slug}/${overrides.id}.png`,
    colorEnhanced: false,
    colorEnhanceLevel: null,
    previousUrl: null,
    previousKey: null,
    previousColorEnhanced: false,
    previousColorEnhanceLevel: null,
    ...overrides,
  };
}

interface Env {
  deps: BatchDeps;
  rows: Map<string, PhotoRow>;
  storage: Map<string, { body: Buffer; contentType: string }>;
  puts: string[];
  updates: string[];
  previews: Array<{ name: string; body: Buffer }>;
  logs: string[];
  failDownloadFor: Set<string>;
  failUpdateFor: Set<string>;
  failManifestWrites: { on: boolean };
}

let env: Env;
let uuidCounter: number;

async function makeEnv(photos: PhotoRow[], images: Record<string, Buffer>): Promise<Env> {
  const rows = new Map(photos.map((p) => [p.id, { ...p }]));
  const storage = new Map<string, { body: Buffer; contentType: string }>();
  for (const p of photos) storage.set(p.key, { body: images[p.id], contentType: "image/png" });
  const e: Env = {
    rows,
    storage,
    puts: [],
    updates: [],
    previews: [],
    logs: [],
    failDownloadFor: new Set(),
    failUpdateFor: new Set(),
    failManifestWrites: { on: false },
    deps: undefined as unknown as BatchDeps,
  };
  uuidCounter = 0;
  e.deps = {
    // Embaralha de propósito: a ordem determinística é responsabilidade do script.
    listPhotos: async () => [...rows.values()].map((r) => ({ ...r })).reverse(),
    getPhoto: async (id) => (rows.get(id) ? { ...rows.get(id)! } : null),
    download: async (photo) => {
      if (e.failDownloadFor.has(photo.id)) throw new Error("R2 indisponível");
      return storage.get(photo.key)!.body;
    },
    autoFit: (buffer) => autoFitSubject(buffer),
    putObject: async (key, body, contentType) => {
      if (key.startsWith("_backups/") && e.failManifestWrites.on) throw new Error("falha ao gravar manifesto");
      e.puts.push(key);
      storage.set(key, { body, contentType });
      return `https://cdn.test/${key}`;
    },
    getObjectText: async (key) => storage.get(key)!.body.toString("utf8"),
    updatePhoto: async (id, data) => {
      if (e.failUpdateFor.has(id)) throw new Error("banco indisponível");
      e.updates.push(id);
      Object.assign(rows.get(id)!, data);
    },
    savePreview: (name, body) => e.previews.push({ name, body }),
    uuid: () => `uuid-${++uuidCounter}`,
    now: () => new Date("2026-10-05T12:00:00Z"),
    log: (line) => e.logs.push(line),
  };
  return e;
}

const SIM: Options = { apply: false };
const APPLY: Options = { apply: true };

beforeEach(async () => {
  const off = await transparentPng(2000, 1600, OFF_CENTER);
  const fitted = await transparentPng(2000, 1600, { left: 100, top: 100, width: 1800, height: 1400 });
  const tiny = await transparentPng(600, 500, { left: 350, top: 50, width: 200, height: 150 });
  env = await makeEnv(
    [
      row({ id: "imgA1", slug: "a-esmeralda", position: 0, colorEnhanced: true, colorEnhanceLevel: "medio", previousUrl: "https://cdn.test/old-prev.png", previousKey: "products/old-prev.png", previousColorEnhanced: true, previousColorEnhanceLevel: "leve" }),
      row({ id: "imgB1", slug: "b-ametista", position: 0 }),
      row({ id: "imgB2", slug: "b-ametista", position: 1 }),
      row({ id: "imgC1", slug: "c-topazio", position: 0 }),
      row({ id: "imgD1", slug: "d-rubi", position: 0 }),
    ],
    { imgA1: off, imgB1: off, imgB2: off, imgC1: fitted, imgD1: tiny }
  );
});

describe("simulação (padrão)", () => {
  it("não grava nada: sem put, sem update, nenhuma foto alterada", async () => {
    const before = JSON.stringify([...env.rows.values()]);
    const report = await runAutoFitBatch(SIM, env.deps);

    expect(report.mode).toBe("simulation");
    expect(env.puts).toEqual([]);
    expect(env.updates).toEqual([]);
    expect(JSON.stringify([...env.rows.values()])).toBe(before);
    expect(report).toMatchObject({ cropped: 3, unchanged: 1, errors: 0, skipped: { too_small_after_crop: 1 } });
  });

  it("processa em ordem determinística (slug, posição, id) mesmo com a listagem embaralhada", async () => {
    const report = await runAutoFitBatch(SIM, env.deps);
    expect(report.rows.map((r) => `${r.slug}#${r.position}`)).toEqual([
      "a-esmeralda#0",
      "b-ametista#0",
      "b-ametista#1",
      "c-topazio#0",
      "d-rubi#0",
    ]);
  });

  it("a tabela mostra produto, tamanho/cobertura antes e depois, ação e razão", async () => {
    const report = await runAutoFitBatch(SIM, env.deps);
    const lines: string[] = [];
    printReport(report, (l) => lines.push(l));
    const text = lines.join("\n");

    expect(lines[0]).toMatch(/produto\s+foto\s+antes.*depois.*ação\s+razão/);
    expect(text).toMatch(/a-esmeralda.*2000x1600 6%.*620x520 \d+%.*cropped/);
    expect(text).toMatch(/c-topazio.*unchanged\s+already_fitted/);
    expect(text).toMatch(/d-rubi.*skipped\s+too_small_after_crop/);
    expect(text).toMatch(/SIMULAÇÃO — nada foi gravado/);
    expect(formatTable(report.rows)).toHaveLength(2 + 5);
  });

  it("--local-preview gera JPEGs 'antes | depois' sem gravar em produção", async () => {
    const report = await runAutoFitBatch({ ...SIM, localPreview: "/tmp/x" }, env.deps);

    expect(env.previews).toHaveLength(report.rows.length);
    expect(env.previews[0].name).toMatch(/^a-esmeralda-0-.*-cropped\.jpg$/);
    const meta = await sharp(env.previews[0].body).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta).toMatchObject({ width: 1208, height: 600 });
    expect(env.puts).toEqual([]);
    expect(env.updates).toEqual([]);
  });

  it("makeSideBySide funciona com PNG transparente (achata sobre o fundo)", async () => {
    const out = await makeSideBySide(await transparentPng(800, 600, { left: 100, top: 100, width: 200, height: 200 }), await transparentPng(400, 300, { left: 50, top: 50, width: 100, height: 100 }));
    expect((await sharp(out).metadata()).format).toBe("jpeg");
  });
});

describe("--apply", () => {
  it("sobe um novo objeto em products/{productId}/auto-fit/{uuid}.png (Content-Type correto) e atualiza url/key", async () => {
    await runAutoFitBatch(APPLY, env.deps);

    const a = env.rows.get("imgA1")!;
    expect(a.key).toBe("products/prod-a-esmeralda/auto-fit/uuid-1.png");
    expect(a.url).toBe("https://cdn.test/products/prod-a-esmeralda/auto-fit/uuid-1.png");
    expect(env.storage.get(a.key)!.contentType).toBe("image/png");
    expect((await sharp(env.storage.get(a.key)!.body).metadata())).toMatchObject({ width: 620, height: 520, hasAlpha: true });
  });

  it("guarda o estado anterior em previousUrl/previousKey e espelha previousColorEnhanced/Level, sem mexer em colorEnhanced", async () => {
    await runAutoFitBatch(APPLY, env.deps);

    const a = env.rows.get("imgA1")!;
    expect(a).toMatchObject({
      previousUrl: "https://cdn.test/products/prod-a-esmeralda/imgA1.png",
      previousKey: "products/prod-a-esmeralda/imgA1.png",
      previousColorEnhanced: true,
      previousColorEnhanceLevel: "medio",
      colorEnhanced: true,
      colorEnhanceLevel: "medio",
    });
  });

  it("só altera fotos recortadas: inalteradas e puladas continuam como estavam", async () => {
    await runAutoFitBatch(APPLY, env.deps);
    expect(env.rows.get("imgC1")!.key).toBe("products/prod-c-topazio/imgC1.png");
    expect(env.rows.get("imgD1")!.key).toBe("products/prod-d-rubi/imgD1.png");
    expect([...env.updates].sort()).toEqual(["imgA1", "imgB1", "imgB2"]);
  });

  it("NUNCA apaga: os objetos antigos continuam no armazenamento", async () => {
    await runAutoFitBatch(APPLY, env.deps);
    for (const key of ["products/prod-a-esmeralda/imgA1.png", "products/prod-b-ametista/imgB1.png", "products/prod-b-ametista/imgB2.png"]) {
      expect(env.storage.has(key)).toBe(true);
    }
    // BatchDeps nem expõe operação de exclusão.
    expect(Object.keys(env.deps).some((k) => /delete|remove/i.test(k))).toBe(false);
  });

  it("segunda execução pula as já enquadradas (key com /auto-fit/): idempotente", async () => {
    await runAutoFitBatch(APPLY, env.deps);
    const putsAfterFirst = env.puts.length;
    const updatesAfterFirst = env.updates.length;

    const second = await runAutoFitBatch(APPLY, env.deps);

    expect(second.cropped).toBe(0);
    expect(second.skipped.already_auto_fit).toBe(3);
    expect(env.puts.length).toBe(putsAfterFirst);
    expect(env.updates.length).toBe(updatesAfterFirst);
    expect(env.rows.get("imgA1")!.key).toContain(AUTO_FIT_KEY_MARKER);
  });

  it("falha numa foto não interrompe as demais e é contada como erro", async () => {
    env.failDownloadFor.add("imgB1");

    const report = await runAutoFitBatch(APPLY, env.deps);

    expect(report.errors).toBe(1);
    expect(report.cropped).toBe(2);
    expect(report.rows.find((r) => r.imageId === "imgB1")).toMatchObject({ action: "error", reason: "R2 indisponível" });
    expect(env.rows.get("imgB1")!.key).toBe("products/prod-b-ametista/imgB1.png"); // intacta
    expect(env.rows.get("imgB2")!.key).toContain(AUTO_FIT_KEY_MARKER);
    expect(env.rows.get("imgA1")!.key).toContain(AUTO_FIT_KEY_MARKER);
  });

  it("falha ao atualizar o banco: a foto não conta como recortada e as demais seguem", async () => {
    env.failUpdateFor.add("imgA1");
    const report = await runAutoFitBatch(APPLY, env.deps);
    expect(report).toMatchObject({ errors: 1, cropped: 2 });
    expect(env.rows.get("imgA1")!.key).toBe("products/prod-a-esmeralda/imgA1.png");
  });

  it("se o manifesto não puder ser gravado, a foto NÃO é alterada no banco", async () => {
    env.failManifestWrites.on = true;
    const report = await runAutoFitBatch(APPLY, env.deps);
    expect(report.errors).toBe(3);
    expect(env.updates).toEqual([]);
  });
});

describe("--product e --limit", () => {
  it("--product filtra por slug", async () => {
    const report = await runAutoFitBatch({ ...APPLY, products: ["b-ametista"] }, env.deps);
    expect(report.rows.map((r) => r.slug)).toEqual(["b-ametista", "b-ametista"]);
    expect(env.rows.get("imgA1")!.key).not.toContain(AUTO_FIT_KEY_MARKER);
  });

  it("--product com slug inexistente avisa e não faz nada", async () => {
    const report = await runAutoFitBatch({ ...SIM, products: ["nao-existe"] }, env.deps);
    expect(report.rows).toEqual([]);
    expect(env.logs.join("\n")).toMatch(/"nao-existe" não encontrado/);
  });

  it("--limit processa só N fotos elegíveis", async () => {
    const report = await runAutoFitBatch({ ...APPLY, limit: 2 }, env.deps);
    expect(report.cropped).toBe(2);
    expect(env.updates).toEqual(["imgA1", "imgB1"]);
  });

  it("--limit é retomável: já enquadradas não gastam o limite, então cada execução avança", async () => {
    await runAutoFitBatch({ ...APPLY, limit: 1 }, env.deps);
    await runAutoFitBatch({ ...APPLY, limit: 1 }, env.deps);
    await runAutoFitBatch({ ...APPLY, limit: 1 }, env.deps);

    expect([...env.updates]).toEqual(["imgA1", "imgB1", "imgB2"]);
  });
});

describe("manifesto e --revert", () => {
  it("grava o manifesto no R2 (_backups/auto-fit-<data-hora>.json) com antigo e novo de cada foto", async () => {
    const report = await runAutoFitBatch(APPLY, env.deps);

    expect(report.manifestKey).toBe("_backups/auto-fit-20261005-120000.json");
    const stored = env.storage.get(report.manifestKey!)!;
    expect(stored.contentType).toBe("application/json");
    const manifest = JSON.parse(stored.body.toString()) as Manifest;
    expect(manifest.entries).toHaveLength(3);
    expect(manifest.entries[0]).toEqual({
      imageId: "imgA1",
      oldUrl: "https://cdn.test/products/prod-a-esmeralda/imgA1.png",
      oldKey: "products/prod-a-esmeralda/imgA1.png",
      oldPreviousUrl: "https://cdn.test/old-prev.png",
      oldPreviousKey: "products/old-prev.png",
      oldPreviousColorEnhanced: true,
      oldPreviousColorEnhanceLevel: "leve",
      newUrl: "https://cdn.test/products/prod-a-esmeralda/auto-fit/uuid-1.png",
      newKey: "products/prod-a-esmeralda/auto-fit/uuid-1.png",
    });
  });

  it("o manifesto já existe mesmo quando uma foto posterior falha", async () => {
    env.failDownloadFor.add("imgB2");
    const report = await runAutoFitBatch(APPLY, env.deps);
    const manifest = JSON.parse(env.storage.get(report.manifestKey!)!.body.toString()) as Manifest;
    expect(manifest.entries.map((e) => e.imageId)).toEqual(["imgA1", "imgB1"]);
  });

  it("--revert --apply restaura url, key e previous* (inclusive o previous antigo) a partir do manifesto", async () => {
    const original = new Map([...env.rows].map(([id, r]) => [id, { ...r }]));
    const { manifestKey } = await runAutoFitBatch(APPLY, env.deps);

    const result = await runRevert({ apply: true, revert: manifestKey }, env.deps);

    expect(result).toMatchObject({ mode: "apply", restored: 3, errors: 0 });
    for (const id of ["imgA1", "imgB1", "imgB2"]) expect(env.rows.get(id)).toEqual(original.get(id));
  });

  it("--revert sem --apply é simulação: não altera nada", async () => {
    const { manifestKey } = await runAutoFitBatch(APPLY, env.deps);
    const snapshot = JSON.stringify([...env.rows.values()]);
    const updatesBefore = env.updates.length;

    const result = await runRevert({ apply: false, revert: manifestKey }, env.deps);

    expect(result).toMatchObject({ mode: "simulation", restored: 3 });
    expect(JSON.stringify([...env.rows.values()])).toBe(snapshot);
    expect(env.updates.length).toBe(updatesBefore);
  });

  it("não restaura foto que o admin mudou depois do lote (changed_since)", async () => {
    const { manifestKey } = await runAutoFitBatch(APPLY, env.deps);
    env.rows.get("imgB1")!.key = "products/prod-b-ametista/previews/novo.png"; // tratamento posterior do admin

    const result = await runRevert({ apply: true, revert: manifestKey }, env.deps);

    expect(result.restored).toBe(2);
    expect(result.skipped).toEqual({ changed_since: 1 });
    expect(env.rows.get("imgB1")!.key).toBe("products/prod-b-ametista/previews/novo.png");
  });

  it("depois do revert o lote pode rodar de novo (as fotos voltam a ser elegíveis)", async () => {
    const { manifestKey } = await runAutoFitBatch(APPLY, env.deps);
    await runRevert({ apply: true, revert: manifestKey }, env.deps);
    const again = await runAutoFitBatch(APPLY, env.deps);
    expect(again.cropped).toBe(3);
  });
});

describe("parseArgs", () => {
  it("padrão é simulação", () => {
    expect(parseArgs([])).toEqual({ apply: false });
  });

  it("lê todas as opções", () => {
    expect(parseArgs(["--apply", "--limit=5", "--product=a,b", "--local-preview=/tmp/p"])).toEqual({
      apply: true,
      limit: 5,
      products: ["a", "b"],
      localPreview: "/tmp/p",
    });
    expect(parseArgs(["--api=https://x.com/", "--local-preview=/tmp/p"])).toMatchObject({ api: "https://x.com" });
    expect(parseArgs(["--revert=_backups/auto-fit-1.json"])).toMatchObject({ revert: "_backups/auto-fit-1.json" });
  });

  it("--api é só leitura: recusa --apply e --revert", () => {
    expect(() => parseArgs(["--api=https://x.com", "--apply"])).toThrow(/somente|só leitura/i);
    expect(() => parseArgs(["--api=https://x.com", "--revert=k"])).toThrow(/só leitura/);
  });

  it("recusa argumentos inválidos", () => {
    expect(() => parseArgs(["--limit=0"])).toThrow(/--limit inválido/);
    expect(() => parseArgs(["--limit=abc"])).toThrow(/--limit inválido/);
    expect(() => parseArgs(["--product="])).toThrow();
    expect(() => parseArgs(["--tudo"])).toThrow(/desconhecido/);
    expect(() => parseArgs(["--revert=k", "--limit=3"])).toThrow(/--revert/);
  });
});
