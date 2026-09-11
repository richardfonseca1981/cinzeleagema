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
    const { email, password } = loginSchema.parse(req.body);

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.active) {
      throw new HttpError(401, "Credenciais inválidas");
    }

    const passwordMatches = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordMatches) {
      throw new HttpError(401, "Credenciais inválidas");
    }

    const token = jwt.sign({ sub: admin.id, email: admin.email, role: admin.role }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    } as jwt.SignOptions);

    res.json({
      token,
      admin: { id: admin.id, email: admin.email, role: admin.role },
    });
  })
);
