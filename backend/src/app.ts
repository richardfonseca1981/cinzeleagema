import express from "express";
import cors from "cors";
import { env } from "./lib/env";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth.routes";
import { productRouter } from "./routes/product.routes";
import { imageRouter } from "./routes/upload.routes";
import { imageTreatmentRouter } from "./routes/imageTreatment.routes";
import { adminUserRouter } from "./routes/adminUser.routes";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRouter);
  app.use("/api/admin-users", adminUserRouter);
  app.use("/api/products", productRouter);
  app.use("/api/products/:productId/images", imageRouter);
  app.use("/api/products/:productId/images/:imageId", imageTreatmentRouter);

  app.use(errorHandler);

  return app;
}
