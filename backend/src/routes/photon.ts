import { Router, Request, Response } from "express";
import { z } from "zod";
import { logger } from "../index";
import { getEnv } from "../lib/env";
import { sendIMessage } from "../lib/photon";

const router = Router();

// ── GET /api/photon/status ──────────────────────────────────────────────────
// Quick configuration check (no send). Safe to call from the frontend.

router.get("/status", (_req: Request, res: Response) => {
  const env = getEnv();
  const status = {
    photonConfigured: Boolean(env.PHOTON_PROJECT_ID && env.PHOTON_PROJECT_SECRET),
    projectId: env.PHOTON_PROJECT_ID
      ? `${env.PHOTON_PROJECT_ID.slice(0, 8)}…`
      : null,
    testNumber: env.PHOTON_TEST_NUMBER,
    discordConfigured: Boolean(env.DISCORD_WEBHOOK_URL),
    sdk: "spectrum-ts@0.4.x",
  };
  logger.info({ status }, "[Photon] Status check");
  return res.json(status);
});

// ── POST /api/photon/test ───────────────────────────────────────────────────
// Send a test iMessage to a phone number to verify the SDK works end-to-end.
// Defaults to PHOTON_TEST_NUMBER if no `to` is provided.

const testBody = z.object({
  to: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
  message: z.string().max(500).optional(),
});

router.post("/test", async (req: Request, res: Response) => {
  const env = getEnv();
  const parsed = testBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const to = parsed.data.to ?? env.PHOTON_TEST_NUMBER;
  const message =
    parsed.data.message ??
    `🧪 ExpenseGuard test message sent at ${new Date().toLocaleString()}`;

  logger.info({ to, messagePreview: message.slice(0, 60) }, "[Photon] Test send requested");

  const result = await sendIMessage(to, message);

  logger.info({ result, to }, "[Photon] Test send result");

  if (result.status === "sent") {
    return res.json({
      ok: true,
      sent_to: to,
      message,
      duration_ms: result.durationMs,
    });
  }

  return res.status(500).json({
    ok: false,
    sent_to: to,
    error: result.error,
    duration_ms: result.durationMs,
    hint: "Check backend logs for full error. Common causes: invalid PHOTON_PROJECT_ID/SECRET, recipient has no iMessage, project has no active iMessage line on Photon dashboard.",
  });
});

export default router;
