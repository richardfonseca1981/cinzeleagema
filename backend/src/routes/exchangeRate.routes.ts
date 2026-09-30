import { Router } from "express";
import { getExchangeRate } from "../lib/exchangeRate";
import { asyncHandler } from "../utils/asyncHandler";

export const exchangeRateRouter = Router();

exchangeRateRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rate, updatedAt } = await getExchangeRate();
    res.json({ rate, updatedAt: updatedAt.toISOString() });
  })
);
