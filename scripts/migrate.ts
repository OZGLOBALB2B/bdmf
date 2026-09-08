/**
 * Applies the SQL migrations in ./drizzle to whatever DATABASE_URL points at.
 *
 * Run against production deliberately, never automatically during a build:
 *   DATABASE_URL="postgresql://…" npx tsx scripts/migrate.ts
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const host = new URL(connectionString).host;
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString)
      ? false
      : { rejectUnauthorized: false },
  });

  console.log(`Applying migrations to ${host}…`);
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("✓ Schema is up to date");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
