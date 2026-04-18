import { Router, Request, Response } from "express";
import { z } from "zod";
import { logger } from "../index";
import { getPolicyConfig, updatePolicyConfig, DEFAULT_POLICY_CONFIG } from "../lib/supabase";

const router = Router();

const policyConfigSchema = z.object({
  high_amount_threshold: z.number().positive().max(1_000_000),
  personal_keywords: z.array(z.string().min(1)).min(0).max(200),
  suspicious_merchant_patterns: z.array(z.string().min(1)).min(0).max(100),
  unusual_hour_start: z.number().int().min(0).max(23),
  unusual_hour_end: z.number().int().min(0).max(23),
});

// ── GET /api/policy/config ────────────────────────────────────────────────────
router.get("/config", async (_req: Request, res: Response) => {
  try {
    const config = await getPolicyConfig();
    return res.json({ config });
  } catch (err) {
    logger.error({ err }, "GET /api/policy/config failed — returning defaults");
    return res.json({ config: DEFAULT_POLICY_CONFIG });
  }
});

// ── PUT /api/policy/config ────────────────────────────────────────────────────
router.put("/config", async (req: Request, res: Response) => {
  const parsed = policyConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const config = await updatePolicyConfig(parsed.data);
    logger.info({ config }, "Policy config updated");
    return res.json({ config });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "PUT /api/policy/config failed");
    return res.status(500).json({ error: msg });
  }
});

export default router;
