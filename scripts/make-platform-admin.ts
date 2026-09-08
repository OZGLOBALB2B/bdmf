/**
 * Grants OZ platform-admin rights to an existing account.
 * Run: npm run oz:grant -- someone@ozglobalb2b.com
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run oz:grant -- email@example.com");
    process.exit(1);
  }

  const [user] = await db
    .update(users)
    .set({ isPlatformAdmin: true })
    .where(eq(users.email, email))
    .returning({ email: users.email });

  if (!user) {
    console.error(`No account with the email ${email}. They need to register first.`);
    process.exit(1);
  }
  console.log(`✓ ${user.email} can now reach /oz`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
