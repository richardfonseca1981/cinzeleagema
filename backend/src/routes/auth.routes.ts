import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { loginSchema } from "../schemas/auth.schema";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);

    const admin = await prisma.adminUser.findUnique({ where: { username } });
    if (!admin || !admin.active) {
      throw new HttpError(401, "Usuário ou senha incorretos");
    }

    const passwordMatches = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordMatches) {
      throw new HttpError(401, "Usuário ou senha incorretos");
    }

    const token = jwt.sign({ sub: admin.id, username: admin.username, role: admin.role }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    } as jwt.SignOptions);

    res.json({
      token,
      admin: { id: admin.id, username: admin.username, role: admin.role },
    });
  })
);
