/**
 * Transaction ingestion pipeline.
 *
 * Both real Knot webhooks and simulated transactions converge here.
 * Steps: normalize → persist → policy eval → Photon alert.
 */

import { logger } from "../index";
import { getEnv } from "./env";
import {
  insertTransaction,
  insertTransactionItems,
  upsertPolicyResult,
  getPolicyResultByTransactionId,
  getPolicyConfig,
  type Transaction,
} from "./supabase";
import { normalizeKnotTransaction } from "./normalizers";
import { evaluatePolicy } from "./policy-engine";
import { sendPolicyAlert } from "./photon";
import type { KnotTransaction } from "./knot";

export interface IngestResult {
  transaction: Transaction;
  policyResult?: import("./supabase").PolicyResult;
  alert?: import("./supabase").Alert;
  policyClassification: string;
  riskScore: number;
  alertStatus: string;
  alreadyEvaluated: boolean;
}

export async function ingestKnotTransaction(
  knotTx: KnotTransaction,
  linkedAccountId: string | null,
  merchantName: string | null,
  source: "knot" | "simulation"
): Promise<IngestResult> {
  const env = getEnv();

  // Step 1: Normalize
  const { transaction: txData, items } = normalizeKnotTransaction(
    knotTx,
    merchantName,
    linkedAccountId,
    source
  );

  logger.info(
    { externalId: txData.external_transaction_id, source, merchant: txData.merchant_name },
    "Ingesting transaction"
  );

  // Step 2: Persist transaction
  const transaction = await insertTransaction(txData);
  logger.info({ transactionId: transaction.id }, "Transaction persisted");

  // Step 3: Persist items
  const itemsWithTxId = items.map((item) => ({
    ...item,
    transaction_id: transaction.id!,
  }));
  await insertTransactionItems(itemsWithTxId);

  // Step 4: Check for duplicate policy evaluation
  const existingPolicy = await getPolicyResultByTransactionId(transaction.id!);
  if (existingPolicy) {
    logger.info(
      { transactionId: transaction.id, classification: existingPolicy.classification },
      "Policy already evaluated — skipping duplicate"
    );
    return {
      transaction,
      policyClassification: existingPolicy.classification,
      riskScore: existingPolicy.risk_score,
      alertStatus: "already_processed",
      alreadyEvaluated: true,
    };
  }

  // Step 5: Evaluate policy (load config from DB, fallback to defaults)
  const policyConfig = await getPolicyConfig().catch(() => null);
  const policyInput = {
    merchantName: transaction.merchant_name,
    amount: Number(transaction.amount),
    currency: transaction.currency,
    transactionDatetime: transaction.transaction_datetime,
    items: itemsWithTxId.map((i) => ({
      name: i.name,
      description: i.description,
      sellerName: i.seller_name,
    })),
    source,
  };

  const policyEval = evaluatePolicy(
    policyInput,
    policyConfig
      ? {
          personalKeywords: policyConfig.personal_keywords,
          suspiciousMerchantPatterns: policyConfig.suspicious_merchant_patterns,
          highAmountThreshold: Number(policyConfig.high_amount_threshold),
          unusualHourStart: policyConfig.unusual_hour_start,
          unusualHourEnd: policyConfig.unusual_hour_end,
        }
      : {}
  );
  logger.info(
    { transactionId: transaction.id, ...policyEval },
    "Policy evaluation complete"
  );

  // Step 6: Persist policy result
  const policyResult = await upsertPolicyResult({
    transaction_id: transaction.id!,
    classification: policyEval.classification,
    risk_score: policyEval.riskScore,
    requires_review: policyEval.requiresReview,
    reasons: policyEval.reasons,
    policy_version: "v1",
  });

  // Step 7: Send Photon alert for flagged transactions
  let alertStatus = "skipped";
  let alert: import("./supabase").Alert | undefined;
  if (policyEval.requiresReview) {
    alert = await sendPolicyAlert({
      transaction,
      policyResult,
      recipient: env.PHOTON_TEST_NUMBER,
    });
    alertStatus = alert.status;
  }

  return {
    transaction,
    policyResult,
    alert,
    policyClassification: policyEval.classification,
    riskScore: policyEval.riskScore,
    alertStatus,
    alreadyEvaluated: false,
  };
}
