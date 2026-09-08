import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * One pool per process. Next's dev server re-evaluates modules on HMR, so the
 * pool is stashed on globalThis to avoid leaking connections.
 */
const globalForDb = globalThis as unknown as { __bdmfPool?: Pool };

const pool =
  globalForDb.__bdmfPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__bdmfPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
