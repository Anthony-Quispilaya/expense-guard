import "dotenv/config";
import express from "express";
import cors from "cors";
import pino from "pino";
import { validateEnv } from "./lib/env";
import healthRouter from "./routes/health";
import knotRouter from "./routes/knot";
import demoRouter from "./routes/demo";

export const logger = pino({
  transport: {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:standard" },
  },
  level: process.env.LOG_LEVEL ?? "info",
});

const env = validateEnv();

const app = express();

app.use(
  cors({
    origin: [env.APP_BASE_URL, "http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  })
);

// Raw body for webhook signature verification
app.use(
  "/api/knot/webhook",
  express.raw({ type: "application/json" })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import reviewsRouter from "./routes/reviews";
import policyRouter from "./routes/policy";

// Routes
app.use("/", healthRouter);
app.use("/api/knot", knotRouter);
app.use("/api/demo", demoRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/policy", policyRouter);

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "Internal server error" });
  }
);

const PORT = env.PORT;
app.listen(PORT, () => {
  logger.info(`Backend running on http://localhost:${PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Supabase URL: ${env.SUPABASE_URL}`);
  const photonMode = env.PHOTON_ADDRESS
    ? `gRPC → ${env.PHOTON_ADDRESS} (iMessage from any platform ✓)`
    : process.platform === "darwin"
    ? "macOS legacy — real sends enabled"
    : `${process.platform} — set PHOTON_ADDRESS+PHOTON_TOKEN for iMessage`;
  logger.info(`Photon: ${photonMode}`);
});

export default app;
