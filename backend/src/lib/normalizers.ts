/**
 * Normalizers — convert Knot API payloads into internal Supabase-ready records.
 *
 * Both real Knot webhooks and simulated transactions pass through here so the
 * downstream pipeline (policy engine, Photon) is identical for both.
 *
 * Key Knot data shape notes:
 *   - price.total is a STRING (e.g. "24.99"), not a number
 *   - products[] is the items field (not items[])
 *   - merchant context comes from the sync wrapper, not the transaction object
 */

import type { KnotTransaction, KnotProduct } from "./knot";
import type { Transaction, TransactionItem } from "./supabase";

export interface NormalizedIngestion {
  transaction: Omit<Transaction, "id" | "created_at" | "updated_at">;
  items: Omit<TransactionItem, "id" | "transaction_id" | "created_at">[];
}

export function normalizeKnotTransaction(
  knotTx: KnotTransaction,
  merchantName: string | null,
  linkedAccountId: string | null,
  source: "knot" | "simulation"
): NormalizedIngestion {
  // price.total is a string in real Knot data; parseFloat handles both string and number
  const amount = parseFloat(String(knotTx.price?.total ?? "0")) || 0;
  const currency = knotTx.price?.currency ?? "USD";

  const transaction: Omit<Transaction, "id" | "created_at" | "updated_at"> = {
    linked_account_id: linkedAccountId,
    external_transaction_id: knotTx.id,
    merchant_name: merchantName,
    transaction_datetime: knotTx.datetime ?? null,
    amount,
    currency,
    order_status: knotTx.order_status ?? null,
    source,
    raw_payload: knotTx as unknown as Record<string, unknown>,
  };

  // Real Knot uses products[], simulated uses items[] — handle both
  const rawProducts: KnotProduct[] =
    (knotTx.products as KnotProduct[]) ??
    (knotTx.items as unknown as KnotProduct[]) ??
    [];

  const items: Omit<TransactionItem, "id" | "transaction_id" | "created_at">[] =
    rawProducts.map((product) => ({
      name: product.name ?? null,
      description: product.description ?? null,
      quantity: product.quantity ?? null,
      // unit_price is a string in real Knot data
      unit_price: product.price?.unit_price
        ? parseFloat(String(product.price.unit_price))
        : null,
      seller_name: product.seller?.name ?? null,
      raw_payload: product as unknown as Record<string, unknown>,
    }));

  return { transaction, items };
}
