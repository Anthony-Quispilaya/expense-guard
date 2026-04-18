import { Router, Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { logger } from "../index";
import { getEnv } from "../lib/env";
import {
  getTransactionById,
  getPolicyResultByTransactionId,
} from "../lib/supabase";
import { ingestKnotTransaction } from "../lib/pipeline";
import { replayAlert } from "../lib/photon";
import type { KnotTransaction } from "../lib/knot";

const router = Router();

// ─── Simulation schemas ────────────────────────────────────────────────────

const simulateTransactionSchema = z.object({
  type: z
    .enum(["suspicious", "approved", "likely_personal"])
    .default("suspicious"),
  merchant_name: z.string().optional(),
  amount: z.number().positive().optional(),
  include_items: z.boolean().default(true),
  custom_payload: z.record(z.unknown()).optional(),
});

// ─── Preset payloads ────────────────────────────────────────────────────────

const PRESETS: Record<string, Partial<KnotTransaction>> = {
  suspicious: {
    price: { total: "892.50", currency: "USD", sub_total: null, adjustments: [] },
    datetime: (() => {
      const d = new Date();
      d.setHours(2, 15, 0, 0);
      return d.toISOString();
    })(),
    order_status: "DELIVERED",
    products: [],
    payment_methods: [{ type: "CARD", last_four: "4242" }],
  },
  likely_personal: {
    price: { total: "87.43", currency: "USD", sub_total: "79.97", adjustments: [] },
    datetime: new Date().toISOString(),
    order_status: "DELIVERED",
    products: [
      {
        name: "Cabernet Sauvignon 750ml",
        description: "Premium red wine",
        quantity: 2,
        price: { unit_price: "28.99", total: "57.98", sub_total: null },
        seller: { name: "Total Wine" },
        eligibility: [],
      },
      {
        name: "Whiskey 1L",
        description: "Single malt scotch",
        quantity: 1,
        price: { unit_price: "54.99", total: "54.99", sub_total: null },
        seller: { name: "Total Wine" },
        eligibility: [],
      },
    ],
    payment_methods: [{ type: "CARD", last_four: "4242" }],
  },
  approved: {
    price: { total: "124.50", currency: "USD", sub_total: "118.00", adjustments: [] },
    datetime: new Date().toISOString(),
    order_status: "DELIVERED",
    products: [
      {
        name: "Printer Paper (500 sheets)",
        description: "Copy paper for office use",
        quantity: 3,
        price: { unit_price: "12.99", total: "38.97", sub_total: null },
        seller: { name: "Staples" },
        eligibility: [],
      },
      {
        name: "Ballpoint Pens (12 pack)",
        description: "Blue ink pens",
        quantity: 2,
        price: { unit_price: "8.49", total: "16.98", sub_total: null },
        seller: { name: "Staples" },
        eligibility: [],
      },
    ],
    payment_methods: [{ type: "CARD", last_four: "4242" }],
  },
};

// ─── POST /api/demo/simulate-transaction ─────────────────────────────────────

router.post(
  "/simulate-transaction",
  async (req: Request, res: Response) => {
    const parsed = simulateTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { type, merchant_name, amount, include_items, custom_payload } =
      parsed.data;

    const PRESET_MERCHANT_NAMES: Record<string, string> = {
      suspicious: "Generic Services LLC",
      likely_personal: "Total Wine & More",
      approved: "Staples",
    };

    // Build simulated Knot-shaped transaction (matches real Knot structure)
    const preset = PRESETS[type];
    const resolvedMerchantName = merchant_name ?? PRESET_MERCHANT_NAMES[type] ?? "Simulated Merchant";
    const simulatedTx: KnotTransaction = {
      ...(preset as KnotTransaction),
      ...(custom_payload as Partial<KnotTransaction>),
      id: `sim_${randomUUID()}`,
      price: {
        ...preset.price!,
        // price.total is a string in real Knot data
        total: amount ? String(amount) : (preset.price?.total ?? "100.00"),
        currency: preset.price?.currency ?? "USD",
        sub_total: preset.price?.sub_total ?? null,
        adjustments: preset.price?.adjustments ?? [],
      },
      products: include_items ? (preset.products ?? []) : [],
      datetime: preset.datetime ?? new Date().toISOString(),
      order_status: preset.order_status ?? "DELIVERED",
    };

    logger.info(
      { type, merchant: resolvedMerchantName, amount: simulatedTx.price.total },
      "Simulating transaction (source=simulation)"
    );

    try {
      const result = await ingestKnotTransaction(
        simulatedTx,
        null, // no real linked account for simulation
        resolvedMerchantName,
        "simulation"
      );

      return res.json({
        simulated: true,
        source: "simulation",
        ...result,
        transaction_id: result.transaction.id,
        merchant: result.transaction.merchant_name,
        amount: result.transaction.amount,
        policyClassification: result.policyResult?.classification ?? null,
        riskScore: result.policyResult?.risk_score ?? null,
        reasons: result.policyResult?.reasons ?? [],
        requiresReview: result.policyResult?.requires_review ?? false,
        alertStatus: result.alert?.status ?? null,
        alertMessage: result.alert?.message_body ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Simulation failed");
      return res.status(500).json({ error: msg });
    }
  }
);

// ─── POST /api/demo/replay-alert/:transactionId ──────────────────────────────

router.post(
  "/replay-alert/:transactionId",
  async (req: Request, res: Response) => {
  const { transactionId } = req.params;
  const txId = String(transactionId);
  const env = getEnv();

    const transaction = await getTransactionById(txId);
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const policyResult = await getPolicyResultByTransactionId(txId);
    if (!policyResult) {
      return res.status(404).json({ error: "No policy result for this transaction" });
    }

    if (policyResult.classification === "approved") {
      return res
        .status(400)
        .json({ error: "Transaction is approved — no alert to replay" });
    }

    try {
      const alert = await replayAlert({
        transaction,
        policyResult,
        recipient: env.PHOTON_TEST_NUMBER,
      });
      return res.json({ replayed: true, alert });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Replay alert failed");
      return res.status(500).json({ error: msg });
    }
  }
);

export default router;
