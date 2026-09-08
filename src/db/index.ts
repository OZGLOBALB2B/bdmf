import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Postgres connection.
 *
 * In development this is one long-lived pool per process, stashed on
 * globalThis so Next's HMR does not leak a new pool on every reload.
 *
 * In production each serverless invocation is its own short-lived process, so
 * a large pool is wasted and can exhaust the database's connection limit under
 * load. Point DATABASE_URL at a POOLED endpoint (on Neon, the host containing
 * `-pooler`) and keep one connection per invocation.
 */
const globalForDb = globalThis as unknown as { __bdmfPool?: Pool };
const isProd = process.env.NODE_ENV === "production";

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local for local work, " +
        "or set it in the hosting provider's environment variables.",
    );
  }

  return new Pool({
    connectionString,
    max: isProd ? 1 : 10,
    idleTimeoutMillis: isProd ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    // Managed Postgres (Neon, Supabase, RDS) terminates TLS with a certificate
    // the Node bundle does not chain to. The connection is still encrypted.
    ssl: /localhost|127\.0\.0\.1/.test(connectionString)
      ? false
      : { rejectUnauthorized: false },
  });
}

const pool = globalForDb.__bdmfPool ?? createPool();
if (!isProd) globalForDb.__bdmfPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
