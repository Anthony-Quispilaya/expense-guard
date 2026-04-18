/**
 * Migration runner — applies supabase/migrations/001_initial_schema.sql
 * to a Supabase PostgreSQL database via direct pg connection.
 *
 * Usage:
 *   DB_URL="postgresql://postgres:[password]@db.esruzpcvkqbexgaznpvi.supabase.co:5432/postgres" \
 *     npx tsx scripts/migrate.ts
 *
 * OR:
 *   DB_URL="postgresql://postgres.esruzpcvkqbexgaznpvi:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
 *     npx tsx scripts/migrate.ts
 *
 * Find your database password at:
 *   Supabase Dashboard → Project Settings → Database → Connection string
 */

import { Client } from "pg";
import { readFileSync } from "fs";
import { resolve } from "path";

const DB_URL = process.env.DB_URL;

if (!DB_URL) {
  console.error(
    "\nERROR: DB_URL environment variable is required.\n\n" +
    "Get your database connection string from:\n" +
    "  Supabase Dashboard → Project Settings → Database → Connection String → URI\n\n" +
    "Then run:\n" +
    '  DB_URL="postgresql://postgres:[your-password]@db.esruzpcvkqbexgaznpvi.supabase.co:5432/postgres" \\\n' +
    "    npx tsx scripts/migrate.ts\n"
  );
  process.exit(1);
}

const sqlPath = resolve(__dirname, "../../supabase/migrations/001_initial_schema.sql");
const sql = readFileSync(sqlPath, "utf8");

async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

  try {
    console.log("Connecting to database…");
    await client.connect();
    console.log("Connected. Running migration…\n");

    await client.query(sql);

    console.log("✓ Migration applied successfully.");
    console.log("  Tables created: linked_accounts, transactions, transaction_items, policy_results, alerts, webhook_events");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("✗ Migration failed:", msg);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
