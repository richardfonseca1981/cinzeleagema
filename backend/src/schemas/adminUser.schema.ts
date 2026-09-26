import { z } from "zod";

const usernameSchema = z
  .string()
  .min(3, "Usuário deve ter ao menos 3 caracteres")
  .max(50)
  .regex(/^[^@\s]+$/, "Usuário não pode conter espaços nem @");

export const createAdminUserSchema = z.object({
  username: usernameSchema,
  password: z.string().min(6, "Senha deve ter ao menos 6 caracteres"),
});
