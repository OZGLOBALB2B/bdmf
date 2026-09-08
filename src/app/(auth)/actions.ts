"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, workspaces, memberships, auditEvents } from "@/db/schema";
import { hashPassword, verifyPassword, createSession, destroySession } from "@/lib/auth";

export type AuthState = { error?: string; notice?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function register(_prev: AuthState, form: FormData): Promise<AuthState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const company = String(form.get("company") ?? "").trim();

  if (!name) return { error: "Tell us your name." };
  if (!EMAIL.test(email)) return { error: "That does not look like an email address." };
  if (password.length < 10)
    return { error: "Use at least 10 characters. Length beats punctuation." };
  if (!company) return { error: "Name the company this workspace is for." };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) {
    // Contributors already exist as passwordless rows; let them claim the account.
    return { error: "That email is already registered. Sign in instead." };
  }

  const passwordHash = await hashPassword(password);

  const userId = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, name, passwordHash, emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    const [ws] = await tx
      .insert(workspaces)
      .values({ name: company })
      .returning({ id: workspaces.id });
    await tx.insert(memberships).values({ userId: user.id, workspaceId: ws.id, role: "admin" });
    await tx.insert(auditEvents).values({
      workspaceId: ws.id,
      actorId: user.id,
      action: "workspace.created",
      detail: { company },
    });
    return user.id;
  });

  await createSession(userId);
  redirect("/");
}

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(eq(users.email, email));

  // One message for both cases, so this cannot be used to enumerate accounts.
  const ok = user && !user.deactivatedAt && (await verifyPassword(password, user.passwordHash));
  if (!ok) return { error: "That email and password do not match an account." };

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
