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
      data: { email: "admin@test.com", passwordHash, role: "admin" },
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "admin@test.com",
      password: "senha-correta",
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.admin.email).toBe("admin@test.com");
  });

  it("rejects invalid credentials", async () => {
    const passwordHash = await bcrypt.hash("senha-correta", 10);
    await prisma.adminUser.create({
      data: { email: "admin@test.com", passwordHash, role: "admin" },
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "admin@test.com",
      password: "senha-errada",
    });

    expect(res.status).toBe(401);
  });

  it("rejects login for an inactive admin", async () => {
    const passwordHash = await bcrypt.hash("senha-correta", 10);
    await prisma.adminUser.create({
      data: { email: "inativo@test.com", passwordHash, role: "admin", active: false },
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "inativo@test.com",
      password: "senha-correta",
    });

    expect(res.status).toBe(401);
  });
});
