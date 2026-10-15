import { Router } from "express";
import { getExchangeRate } from "../lib/exchangeRate";
import { asyncHandler } from "../utils/asyncHandler";

export const exchangeRateRouter = Router();

exchangeRateRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rate, updatedAt, source } = await getExchangeRate();
    // `source` é aditivo: "live" | "stale" | "fallback" (ver lib/exchangeRate.ts)
    res.json({ rate, updatedAt: updatedAt.toISOString(), source });
  })
);
