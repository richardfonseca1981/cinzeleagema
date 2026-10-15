import { NextFunction, Request, Response } from "express";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

// Limitador simples por IP, em memória (sem infra de rate limit existente
// no projeto para reaproveitar). Não é distribuído — reinicia a cada deploy
// e não compartilha estado entre instâncias, suficiente para o volume atual
// do site.
export function createIpRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (bucket.count >= options.max) {
      return res.status(429).json({ error: "Muitas requisições, tente novamente em alguns instantes" });
    }

    bucket.count += 1;
    next();
  };
}
