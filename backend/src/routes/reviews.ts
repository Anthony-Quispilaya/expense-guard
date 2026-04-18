import { Router, Request, Response } from "express";
import { z } from "zod";
import { logger } from "../index";
import {
  getSupabaseClient,
  getReviewByTransactionId,
  upsertReview,
  type Review,
} from "../lib/supabase";

const router = Router();

const reviewBodySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "needs_receipt", "needs_explanation"]),
  reviewer_note: z.string().max(2000).optional().nullable(),
  reviewed_by: z.string().max(200).default("reviewer"),
});

// ── GET /api/reviews ──────────────────────────────────────────────────────────
// Returns all flagged transactions joined with their review status.
// Query params: ?status=pending|approved|rejected (filters review status)

router.get("/", async (req: Request, res: Response) => {
  const filterStatus = req.query.status as string | undefined;
  const sb = getSupabaseClient();

  try {
    // Fetch all transactions that were classified as suspicious or likely_personal
    const { data: policyRows, error: pErr } = await sb
      .from("policy_results")
      .select(
        "transaction_id, classification, risk_score, reasons, requires_review, created_at"
      )
      .in("classification", ["suspicious", "likely_personal"])
      .order("created_at", { ascending: false })
      .limit(200);

    if (pErr) throw new Error(pErr.message);
    if (!policyRows || policyRows.length === 0) return res.json({ items: [] });

    const txIds = policyRows.map((r) => r.transaction_id);

    // Fetch transactions
    const { data: txRows, error: txErr } = await sb
      .from("transactions")
      .select("id, merchant_name, amount, currency, transaction_datetime, source, created_at")
      .in("id", txIds);
    if (txErr) throw new Error(txErr.message);

    // Fetch reviews (may return error if table doesn't exist yet — handle gracefully)
    const { data: reviewRows } = await sb
      .from("reviews")
      .select("*")
      .in("transaction_id", txIds);

    // Fetch alerts
    const { data: alertRows } = await sb
      .from("alerts")
      .select("transaction_id, status, channel, sent_at")
      .in("transaction_id", txIds);

    const txMap = Object.fromEntries((txRows ?? []).map((t) => [t.id, t]));
    const reviewMap = Object.fromEntries((reviewRows ?? []).map((r) => [r.transaction_id, r]));
    const alertMap = Object.fromEntries((alertRows ?? []).map((a) => [a.transaction_id, a]));

    let items = policyRows.map((p) => ({
      transaction_id: p.transaction_id,
      classification: p.classification,
      risk_score: p.risk_score,
      reasons: p.reasons,
      policy_created_at: p.created_at,
      transaction: txMap[p.transaction_id] ?? null,
      review: reviewMap[p.transaction_id] ?? null,
      alert: alertMap[p.transaction_id] ?? null,
    }));

    // Apply review status filter
    if (filterStatus) {
      items = items.filter((i) => {
        const reviewStatus = i.review?.status ?? "pending";
        return reviewStatus === filterStatus;
      });
    }

    return res.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "GET /api/reviews failed");
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/reviews/transaction/:txId ───────────────────────────────────────
// Full transaction detail: tx + items + policy + alert + review

router.get("/transaction/:txId", async (req: Request, res: Response) => {
  const { txId } = req.params;
  const sb = getSupabaseClient();

  try {
    const [txRes, itemsRes, policyRes, alertsRes, reviewRes] = await Promise.all([
      sb.from("transactions").select("*").eq("id", txId).single(),
      sb.from("transaction_items").select("*").eq("transaction_id", txId).order("created_at"),
      sb.from("policy_results").select("*").eq("transaction_id", txId).single(),
      sb.from("alerts").select("*").eq("transaction_id", txId).order("created_at", { ascending: false }),
      sb.from("reviews").select("*").eq("transaction_id", txId).single(),
    ]);

    if (txRes.error || !txRes.data) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    return res.json({
      transaction: txRes.data,
      items: itemsRes.data ?? [],
      policy: policyRes.data ?? null,
      alerts: alertsRes.data ?? [],
      review: reviewRes.data ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, txId }, "GET /api/reviews/transaction/:txId failed");
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/reviews/transaction/:txId ──────────────────────────────────────
// Create or update a review decision for a transaction

router.post("/transaction/:txId", async (req: Request, res: Response) => {
  const txId = req.params.txId as string;

  const parsed = reviewBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { status, reviewer_note, reviewed_by } = parsed.data;

  try {
    const review = await upsertReview({
      transaction_id: txId,
      status,
      reviewer_note: reviewer_note ?? null,
      reviewed_by,
      reviewed_at: status !== "pending" ? new Date().toISOString() : null,
    });

    logger.info({ txId, status, reviewed_by }, "Review saved");
    return res.json({ review });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, txId }, "POST /api/reviews/transaction/:txId failed");
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/reviews/counts ───────────────────────────────────────────────────
// Summary counts for the dashboard badge

router.get("/counts", async (_req: Request, res: Response) => {
  const sb = getSupabaseClient();
  try {
    const [flaggedRes, reviewsRes] = await Promise.all([
      sb
        .from("policy_results")
        .select("id", { count: "exact", head: true })
        .in("classification", ["suspicious", "likely_personal"]),
      sb
        .from("reviews")
        .select("status", { count: "exact" })
        .neq("status", "pending"),
    ]);

    const totalFlagged = flaggedRes.count ?? 0;
    const reviewed = (reviewsRes.data ?? []).length;
    const pending = Math.max(0, totalFlagged - reviewed);

    return res.json({ total_flagged: totalFlagged, pending, reviewed });
  } catch {
    return res.json({ total_flagged: 0, pending: 0, reviewed: 0 });
  }
});

export default router;
