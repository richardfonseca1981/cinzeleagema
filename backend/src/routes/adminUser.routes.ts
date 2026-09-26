import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { createAdminUserSchema } from "../schemas/adminUser.schema";

export const adminUserRouter = Router();

adminUserRouter.use(requireAuth);

const publicSelect = { id: true, username: true, role: true, active: true, createdAt: true } as const;

adminUserRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const admins = await prisma.adminUser.findMany({
      select: publicSelect,
      orderBy: { createdAt: "asc" },
    });
    res.json(admins);
  })
);

adminUserRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createAdminUserSchema.parse(req.body);

    const existing = await prisma.adminUser.findUnique({ where: { username: data.username } });
    if (existing) {
      throw new HttpError(409, "Já existe um usuário com esse nome");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const admin = await prisma.adminUser.create({
      data: { username: data.username, passwordHash, role: "admin" },
      select: publicSelect,
    });
    res.status(201).json(admin);
  })
);

adminUserRouter.patch(
  "/:id/deactivate",
  asyncHandler(async (req, res) => {
    if (req.params.id === req.admin?.sub) {
      throw new HttpError(400, "Você não pode desativar seu próprio usuário");
    }

    const admin = await prisma.adminUser.update({
      where: { id: req.params.id },
      data: { active: false },
      select: publicSelect,
    });
    res.json(admin);
  })
);
