import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("Auth routes", () => {
  it("logs in with valid credentials and returns a JWT", async () => {
    const passwordHash = await bcrypt.hash("senha-correta", 10);
    await prisma.adminUser.create({
      data: { username: "admin", email: "admin@test.com", passwordHash, role: "admin" },
    });

    const res = await request(app).post("/api/auth/login").send({
      username: "admin",
      password: "senha-correta",
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.admin.username).toBe("admin");
  });

  it("rejects invalid credentials", async () => {
    const passwordHash = await bcrypt.hash("senha-correta", 10);
    await prisma.adminUser.create({
      data: { username: "admin", email: "admin@test.com", passwordHash, role: "admin" },
    });

    const res = await request(app).post("/api/auth/login").send({
      username: "admin",
      password: "senha-errada",
    });

    expect(res.status).toBe(401);
  });

  it("rejects login for an inactive admin", async () => {
    const passwordHash = await bcrypt.hash("senha-correta", 10);
    await prisma.adminUser.create({
      data: { username: "inativo", email: "inativo@test.com", passwordHash, role: "admin", active: false },
    });

    const res = await request(app).post("/api/auth/login").send({
      username: "inativo",
      password: "senha-correta",
    });

    expect(res.status).toBe(401);
  });
});
