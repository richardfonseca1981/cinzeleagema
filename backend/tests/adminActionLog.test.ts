import { afterAll, beforeEach, describe, expect, it } from "vitest";
import "./setup";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase } from "./helpers";
import { getLastAction, recordAdminAction } from "../src/lib/adminActionLog";

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("recordAdminAction / getLastAction", () => {
  it("grava a ação com ator, tipo e payload reais", async () => {
    await recordAdminAction(prisma, { id: "admin-1", username: "felipe" }, "bulk_category_move", {
      before: [{ id: "p1", categoryId: "cat-a", subcategoryId: null }],
      after: [{ id: "p1", categoryId: "cat-b", subcategoryId: null }],
    });

    const rows = await prisma.adminActionLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      adminId: "admin-1",
      adminUsername: "felipe",
      action: "bulk_category_move",
    });
    expect(rows[0].payload).toEqual({
      before: [{ id: "p1", categoryId: "cat-a", subcategoryId: null }],
      after: [{ id: "p1", categoryId: "cat-b", subcategoryId: null }],
    });
  });

  it("getLastAction devolve a entrada mais recente DAQUELE tipo de ação, ignorando outras", async () => {
    await recordAdminAction(prisma, { id: "admin-1", username: "felipe" }, "category_create", { id: "cat-x" });
    await recordAdminAction(prisma, { id: "admin-1", username: "felipe" }, "bulk_category_move", { marker: "primeira" });
    await recordAdminAction(prisma, { id: "admin-1", username: "felipe" }, "bulk_category_move", { marker: "segunda" });

    const last = await getLastAction("bulk_category_move");
    expect(last?.payload).toMatchObject({ marker: "segunda" });
  });

  it("sem nenhuma ação daquele tipo, getLastAction devolve null", async () => {
    expect(await getLastAction("bulk_category_move")).toBeNull();
  });

  it("gravação dentro de uma transação que é desfeita (rollback) não deixa o log para trás", async () => {
    await prisma
      .$transaction(async (tx) => {
        await recordAdminAction(tx, { id: "admin-1", username: "felipe" }, "bulk_category_move", { marker: "sera-desfeito" });
        throw new Error("forçando rollback");
      })
      .catch(() => {});

    expect(await getLastAction("bulk_category_move")).toBeNull();
  });
});
