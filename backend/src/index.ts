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
import photonRouter from "./routes/photon";

// Routes
app.use("/", healthRouter);
app.use("/api/knot", knotRouter);
app.use("/api/demo", demoRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/policy", policyRouter);
app.use("/api/photon", photonRouter);

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
const server = app.listen(PORT, () => {
  logger.info(`Backend running on http://localhost:${PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Supabase URL: ${env.SUPABASE_URL}`);
  const photonMode = env.PHOTON_PROJECT_ID
    ? `spectrum-ts cloud (project ${env.PHOTON_PROJECT_ID.slice(0, 8)}…) ✓`
    : `not configured — set PHOTON_PROJECT_ID+PHOTON_PROJECT_SECRET`;
  logger.info(`Photon iMessage: ${photonMode}`);
  logger.info(`Discord webhook: ${env.DISCORD_WEBHOOK_URL ? "configured ✓" : "not set"}`);
});

// ── Graceful shutdown — close Spectrum connections on SIGINT/SIGTERM ───────
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown requested");
  try {
    const { stopSpectrum } = await import("./lib/photon");
    await stopSpectrum();
  } catch (err) {
    logger.error({ err }, "Error during spectrum shutdown");
  }
  server.close(() => {
    logger.info("HTTP server closed — exiting");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

export default app;
