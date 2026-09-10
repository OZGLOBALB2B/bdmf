import "server-only";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users, verificationTokens, auditEvents } from "@/db/schema";
import { newToken, hashToken } from "./crypto";
import { send, mailConfigured } from "./mail";
import { verifyEmail } from "./mail/templates";

/**
 * Email verification for password accounts.
 *
 * Contributors are deliberately not covered: they reach their task through a
 * single-purpose link sent to their address, so opening it already proves
 * control of that inbox. Sending them a second email to prove the same thing
 * would be friction with no security gain — see markVerifiedByLink().
 */

const TOKEN_HOURS = 24;
const RESEND_COOLDOWN_SECONDS = 60;

export type IssueResult =
  | { ok: true }
  | { ok: false; reason: "cooldown"; retryInSeconds: number }
  | { ok: false; reason: "mail_unconfigured" }
  | { ok: false; reason: "send_failed"; error: string };

/** Issues a fresh link, replacing any previous one for this user. */
export async function issueVerification(
  userId: string,
  email: string,
  name: string | null,
): Promise<IssueResult> {
  const [existing] = await db
    .select({ sentAt: verificationTokens.sentAt })
    .from(verificationTokens)
    .where(eq(verificationTokens.userId, userId));

  if (existing) {
    const elapsed = (Date.now() - existing.sentAt.getTime()) / 1000;
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        reason: "cooldown",
        retryInSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
      };
    }
  }

  // Without a mail provider the link cannot reach the person who owns the
  // address. Showing it on screen instead would let anyone verify an address
  // they do not control, which is the whole thing this guards against.
  if (!mailConfigured()) return { ok: false, reason: "mail_unconfigured" };

  const token = newToken();
  const expiresAt = new Date(Date.now() + TOKEN_HOURS * 3600_000);

  await db
    .insert(verificationTokens)
    .values({ userId, tokenHash: hashToken(token), expiresAt })
    .onConflictDoUpdate({
      target: verificationTokens.userId,
      set: { tokenHash: hashToken(token), expiresAt, sentAt: new Date() },
    });

  const result = await send(verifyEmail({ to: email, name, token }));
  if (!result.ok) return { ok: false, reason: "send_failed", error: result.error ?? "unknown" };

  return { ok: true };
}

/** Consumes a link. Returns the user id on success, null on anything else. */
export async function consumeVerification(token: string): Promise<string | null> {
  const [row] = await db
    .select({ id: verificationTokens.id, userId: verificationTokens.userId })
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, hashToken(token)),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    );
  if (!row) return null;

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, row.userId));
    await tx.delete(verificationTokens).where(eq(verificationTokens.id, row.id));
    await tx.insert(auditEvents).values({
      actorId: row.userId,
      action: "user.email_verified",
    });
  });

  return row.userId;
}

/**
 * A contributor followed a link that was emailed to them, which is proof of
 * inbox control — so record the address as verified. Cheap, idempotent, and it
 * means the OZ back office reports honestly on who has a confirmed address.
 */
export async function markVerifiedByLink(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
}
