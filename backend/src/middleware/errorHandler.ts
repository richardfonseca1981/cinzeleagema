import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Erros do body-parser (usado por express.json(), ver app.ts) — sem isso
  // os dois caíam no 500 genérico abaixo. Checado pelo `.type` (estável
  // entre versões do body-parser), não só pelo `.status`, pra nunca
  // confundir com um 400/413 vindo de outro lugar. Importa pro webhook
  // público do Mercado Livre (Fase 1B etapa 8): JSON malformado => 400,
  // corpo acima do limite => 413.
  if (err && typeof err === "object" && "type" in err) {
    const bodyParserErr = err as { type?: string; status?: number };
    if (bodyParserErr.type === "entity.parse.failed") {
      return res.status(400).json({ error: "JSON inválido no corpo da requisição" });
    }
    if (bodyParserErr.type === "entity.too.large") {
      return res.status(413).json({ error: "Corpo da requisição excede o limite permitido" });
    }
  }

  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Dados inválidos", details: err.flatten() });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Já existe um registro com esse valor único", meta: err.meta });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Registro não encontrado" });
    }
  }

  console.error(err);
  return res.status(500).json({ error: "Erro interno do servidor" });
}
