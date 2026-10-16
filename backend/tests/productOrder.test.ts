import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";

const app = createApp();
const auth = { Authorization: `Bearer ${generateTestToken()}` };
const ORDER_PATH = "/api/admin/products/order";

let ids: string[] = [];
let categoryId: string;

async function makeProduct(i: number, extra: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: { name: `Peça ${i}`, slug: `peca-ordem-${i}`, price: 10, sortOrder: i, categoryId, ...extra },
  });
}

async function publicIds(query = "") {
  const res = await request(app).get(`/api/products?pageSize=100${query}`);
  return res.body.items.map((p: { id: string }) => p.id) as string[];
}

beforeEach(async () => {
  await cleanDatabase();
  categoryId = (await prisma.category.create({ data: { name: "Pedras", slug: "pedras" } })).id;
  ids = [];
  for (let i = 0; i < 5; i += 1) ids.push((await makeProduct(i)).id);
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("ordem das peças", () => {
  it("exige login (GET e PUT)", async () => {
    expect((await request(app).get(ORDER_PATH)).status).toBe(401);
    expect((await request(app).put(ORDER_PATH).send({ order: ids })).status).toBe(401);
  });

  it("site público segue sortOrder", async () => {
    expect(await publicIds()).toEqual(ids);
  });

  it("PUT persiste a nova ordem e o site reflete", async () => {
    const next = [ids[3], ids[0], ids[4], ids[1], ids[2]];
    const res = await request(app).put(ORDER_PATH).set(auth).send({ order: next });
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: { id: string }) => p.id)).toEqual(next);
    expect(await publicIds()).toEqual(next);
    const rows = await prisma.product.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2, 3, 4]);
  });

  it("filtro por categoria preserva a ordem relativa", async () => {
    const other = await prisma.category.create({ data: { name: "Outra", slug: "outra" } });
    await prisma.product.update({ where: { id: ids[1] }, data: { categoryId: other.id } });
    const next = [ids[4], ids[3], ids[2], ids[1], ids[0]];
    await request(app).put(ORDER_PATH).set(auth).send({ order: next });
    expect(await publicIds(`&categoryId=${categoryId}`)).toEqual([ids[4], ids[3], ids[2], ids[0]]);
  });

  it("rejeita ids repetidos e corpo vazio", async () => {
    expect((await request(app).put(ORDER_PATH).set(auth).send({ order: [ids[0], ids[0]] })).status).toBe(400);
    expect((await request(app).put(ORDER_PATH).set(auth).send({ order: [] })).status).toBe(400);
  });

  it("ignora ids desconhecidos", async () => {
    const res = await request(app)
      .put(ORDER_PATH)
      .set(auth)
      .send({ order: ["nao-existe", ...[...ids].reverse()] });
    expect(res.status).toBe(200);
    expect(await publicIds()).toEqual([...ids].reverse());
  });

  it("peça que não veio na lista (criada durante a edição) vai para o topo", async () => {
    const res = await request(app)
      .put(ORDER_PATH)
      .set(auth)
      .send({ order: [ids[4], ids[3], ids[2], ids[1]] });
    expect(res.status).toBe(200);
    expect(await publicIds()).toEqual([ids[0], ids[4], ids[3], ids[2], ids[1]]);
  });

  it("peças inativas mantêm a posição e aparecem na lista do admin", async () => {
    await prisma.product.update({ where: { id: ids[2] }, data: { active: false } });
    const next = [ids[2], ...ids.filter((i) => i !== ids[2])];
    await request(app).put(ORDER_PATH).set(auth).send({ order: next });
    const list = await request(app).get(ORDER_PATH).set(auth);
    expect(list.body.total).toBe(5);
    expect(list.body.items[0]).toMatchObject({ id: ids[2], active: false });
    expect(await publicIds()).not.toContain(ids[2]);
  });

  it("peça nova criada via POST entra no topo", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "Nova", categoryId, price: 5, description: null, subcategoryId: null, sku: null, trackStock: false });
    expect(res.status).toBe(201);
    expect((await publicIds())[0]).toBe(res.body.id);
  });

  it("Excel sai na mesma ordem do site", async () => {
    const next = [ids[2], ids[4], ids[0], ids[3], ids[1]];
    await request(app).put(ORDER_PATH).set(auth).send({ order: next });
    const res = await request(app)
      .get("/api/admin/products/export")
      .set(auth)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const sheet = wb.worksheets[0];
    const headerRow = sheet.getRow(1).values as unknown[];
    let headerIdx = 1;
    for (let r = 1; r <= 15; r += 1) {
      const vals = sheet.getRow(r).values as unknown[];
      if (vals.includes("ID")) {
        headerIdx = r;
        break;
      }
    }
    void headerRow;
    const col = (sheet.getRow(headerIdx).values as unknown[]).indexOf("ID");
    const got = [1, 2, 3, 4, 5].map((n) => String(sheet.getRow(headerIdx + n).getCell(col).value));
    expect(got).toEqual(next);
  });
});
