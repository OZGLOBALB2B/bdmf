import "server-only";
import { cookies } from "next/headers";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@/db";
import { users, sessions, memberships, workspaces } from "@/db/schema";
import { newToken, hashToken } from "./crypto";

export { hashPassword, verifyPassword, newToken, hashToken } from "./crypto";

const SESSION_COOKIE = "bdmf_session";
const SESSION_DAYS = 30;

/* -------------------------------------------------------------- sessions */

export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
};

/** The signed-in user, or null. Never throws. */
export async function currentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isPlatformAdmin: users.isPlatformAdmin,
      deactivatedAt: users.deactivatedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || row.deactivatedAt) return null;
  return { id: row.id, email: row.email, name: row.name, isPlatformAdmin: row.isPlatformAdmin };
}

/* ----------------------------------------------------------- memberships */

export type WorkspaceMembership = {
  workspaceId: string;
  workspaceName: string;
  role: "admin" | "contributor";
  suspended: boolean;
};

export async function membershipsFor(userId: string): Promise<WorkspaceMembership[]> {
  return db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      role: memberships.role,
      suspended: workspaces.suspended,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId));
}
