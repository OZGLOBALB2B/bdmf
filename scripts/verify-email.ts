/**
 * Confirms an email address from the server, for installations with no mail
 * provider configured yet.
 *
 *   npm run verify -- someone@example.com
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, verificationTokens } from "../src/db/schema";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run verify -- email@example.com");
    process.exit(1);
  }

  const [user] = await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.email, email))
    .returning({ id: users.id, email: users.email });

  if (!user) {
    console.error(`No account with the email ${email}.`);
    process.exit(1);
  }

  await db.delete(verificationTokens).where(eq(verificationTokens.userId, user.id));
  console.log(`✓ ${user.email} confirmed — they can open their workspace now`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
