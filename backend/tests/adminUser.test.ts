import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import "./setup";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { cleanDatabase, generateTestToken } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("Admin user routes", () => {
  it("rejects requests without an auth token", async () => {
    const res = await request(app).get("/api/admin-users");
    expect(res.status).toBe(401);
  });

  it("creates a new admin user without exposing the password hash", async () => {
    const token = generateTestToken();

    const res = await request(app)
      .post("/api/admin-users")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "novo.admin", password: "senha123" });

    expect(res.status).toBe(201);
    expect(res.body.username).toBe("novo.admin");
    expect(res.body.role).toBe("admin");
    expect(res.body.active).toBe(true);
    expect(res.body.passwordHash).toBeUndefined();
  });

  it("rejects a username containing @", async () => {
    const token = generateTestToken();

    const res = await request(app)
      .post("/api/admin-users")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "admin@teste.com", password: "senha123" });

    expect(res.status).toBe(400);
  });

  it("rejects a password shorter than 6 characters", async () => {
    const token = generateTestToken();

    const res = await request(app)
      .post("/api/admin-users")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "curto", password: "123" });

    expect(res.status).toBe(400);
  });

  it("returns a friendly error for a duplicate username", async () => {
    const token = generateTestToken();
    const passwordHash = await bcrypt.hash("senha123", 10);
    await prisma.adminUser.create({ data: { username: "duplicado", passwordHash, role: "admin" } });

    const res = await request(app)
      .post("/api/admin-users")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "duplicado", password: "senha123" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Já existe um usuário com esse nome");
  });

  it("lists admin users without exposing password hashes", async () => {
    const token = generateTestToken();
    const passwordHash = await bcrypt.hash("senha123", 10);
    await prisma.adminUser.create({ data: { username: "listado", passwordHash, role: "admin" } });

    const res = await request(app).get("/api/admin-users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].username).toBe("listado");
    expect(res.body[0].passwordHash).toBeUndefined();
  });

  it("deactivates another admin user", async () => {
    const token = generateTestToken({ sub: "requester-id" });
    const passwordHash = await bcrypt.hash("senha123", 10);
    const target = await prisma.adminUser.create({ data: { username: "alvo", passwordHash, role: "admin" } });

    const res = await request(app)
      .patch(`/api/admin-users/${target.id}/deactivate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  it("blocks an admin from deactivating themselves", async () => {
    const passwordHash = await bcrypt.hash("senha123", 10);
    const self = await prisma.adminUser.create({ data: { username: "eu-mesmo", passwordHash, role: "admin" } });
    const token = generateTestToken({ sub: self.id });

    const res = await request(app)
      .patch(`/api/admin-users/${self.id}/deactivate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
